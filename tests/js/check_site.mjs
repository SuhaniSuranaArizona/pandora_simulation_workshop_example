// Structure, accessibility and contrast checks for the static site. Run: node tests/js/check_site.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "../../site");
const pages = ["index.html", "star.html", "pandora.html", "about.html"];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};
const html = Object.fromEntries(pages.map((p) => [p, readFileSync(join(site, p), "utf8")]));
const tags = (src, tag) => [...src.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) => m[1]);
const attr = (a, name) => (a.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [])[1];

for (const p of pages) {
  const s = html[p];
  check(`${p}: language, title and one h1`, /<html lang="en"/.test(s) && /<title>[^<]+<\/title>/.test(s) && (s.match(/<h1\b/g) || []).length === 1);
  const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  check(`${p}: ids are unique`, new Set(ids).size === ids.length);
  check(`${p}: skip link targets an existing id`, /href="#main"/.test(s) && ids.includes("main"));

  const bad = [];
  for (const a of tags(s, "a")) {
    const href = attr(a, "href");
    if (!href || href.startsWith("http")) { if (href && !/rel="[^"]*noopener/.test(a)) bad.push(href + " lacks rel=noopener"); continue; }
    if (href.startsWith("#")) { if (!ids.includes(href.slice(1))) bad.push(href); continue; }
    if (!existsSync(join(site, href))) bad.push(href);
  }
  for (const t of [...tags(s, "script"), ...tags(s, "link")]) {
    const ref = attr(t, "src") ?? attr(t, "href");
    if (!ref || ref.startsWith("data:")) continue;
    if (/^https?:/.test(ref)) bad.push("external resource " + ref);
    else if (!existsSync(join(site, ref))) bad.push(ref);
  }
  check(`${p}: links and resources resolve, none external`, bad.length === 0, bad.join(", "));

  const labelled = new Set([...s.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  const unlabelled = tags(s, "input").filter((a) => !labelled.has(attr(a, "id")) && !attr(a, "aria-label"));
  check(`${p}: every input has a label`, unlabelled.length === 0);
  const canvases = tags(s, "canvas");
  check(`${p}: every canvas has role="img" and an aria-label`, canvases.every((a) => attr(a, "role") === "img" && attr(a, "aria-label")));
  const buttons = [...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  check(`${p}: every button has a name`, buttons.every((m) => m[2].replace(/<[^>]+>/g, "").trim() || attr(m[1], "aria-label")));
  check(`${p}: no heading levels skipped`, (() => {
    let last = 0;
    for (const m of s.matchAll(/<h([1-6])\b/g)) { const n = +m[1]; if (n > last + 1) return false; last = n; }
    return true;
  })());
}

const navOf = (s) => [...(s.match(/<nav aria-label="Pages">[\s\S]*?<\/nav>/) || [""])[0].matchAll(/<a href="([^"]+)"([^>]*)>/g)].map((m) => [m[1], /aria-current="page"/.test(m[2])]);
const ref = navOf(html["index.html"]).map((x) => x[0]);
check("navigation lists the same four pages everywhere", pages.every((p) => JSON.stringify(navOf(html[p]).map((x) => x[0])) === JSON.stringify(ref)) && ref.length === 4);
check("navigation marks the current page", pages.every((p) => { const cur = navOf(html[p]).filter((x) => x[1]); return cur.length === 1 && cur[0][0] === p; }));

// Contrast (WCAG 2.x), both themes, for the colour pairs the pages actually use.
const css = readFileSync(join(site, "css/style.css"), "utf8");
const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = vars(css.match(/:root\s*{([^}]*)}/)[1]);
const dark = { ...light, ...vars(css.match(/prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/)[1]) };
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const blend = (fg, bg, a) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
const pairs = (v) => [
  ["body text on page", v.ink, v.bg, 4.5], ["body text on card", v.ink, v.surface, 4.5],
  ["muted text on card", v.muted, v.surface, 4.5], ["muted text on page", v.muted, v.bg, 4.5],
  ["link on card", v.accent, v.surface, 4.5], ["button text", v["accent-ink"], v.accent, 4.5],
  ["white on visible band", "#ffffff", v["band-vis"], 4.5], ["white on near-IR band", "#ffffff", v["band-nir"], 4.5],
  ["note text", v.warn, v["warn-bg"], 4.5], ["'inside range' chip", v["ok-ink"], blend(v.fixed, v.surface, 0.16), 4.5],
  ["true curve on card", v.true, v.surface, 3], ["measured curve on card", v.observed, v.surface, 3],
  ["visible data on card", v.visible, v.surface, 3], ["near-IR data on card", v.nir, v.surface, 3],
  ["corrected curve on card", v.fixed, v.surface, 3],
];
for (const [theme, v] of [["light", light], ["dark", dark]]) {
  for (const [name, fg, bg, min] of pairs(v)) {
    const r = ratio(fg, bg);
    check(`contrast (${theme}): ${name}`, r >= min, `${r.toFixed(2)}:1, needs ${min}`);
  }
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll site checks passed");
process.exit(failures ? 1 : 0);
