// Checks the page-3 correction and scenario code. Run: node tests/js/check_correction.mjs
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const site = join(dirname(fileURLToPath(import.meta.url)), "../../site/js");
globalThis.PandoraModel = require(join(site, "model.js"));
require(join(site, "presets.js"));
require(join(site, "calibration.js"));
globalThis.PandoraCorrection = require(join(site, "correction.js"));
const S = require(join(site, "scenario.js"));
const C = globalThis.PandoraCorrection, Cal = globalThis.PandoraCalibration;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures++;
};

// 1. The sinusoid fit recovers known coefficients, and its covariance is honest.
{
  const t = Array.from({ length: 50 }, (_, i) => i * 0.1), P = 4;
  const w = (2 * Math.PI) / P, v = t.map((x) => 1 + 0.02 * Math.cos(w * x) - 0.01 * Math.sin(w * x));
  const f = C.fitSinusoid(t, v, P, 1e-3);
  check("sinusoid fit recovers noise-free coefficients",
    Math.abs(f.c0 - 1) < 1e-12 && Math.abs(f.a - 0.02) < 1e-12 && Math.abs(f.b + 0.01) < 1e-12);

  const rng = C.mulberry32(1), sigma = 0.004, z = [];
  for (let trial = 0; trial < 400; trial++) {
    const noisy = v.map((x) => x + sigma * C.normal(rng)), g = C.fitSinusoid(t, noisy, P, sigma);
    z.push((g.a - 0.02) / Math.sqrt(g.cov[4]));
  }
  const sd = Math.sqrt(z.reduce((a, b) => a + b * b, 0) / z.length);
  check("fit covariance matches the scatter of repeated noisy fits", sd > 0.85 && sd < 1.15, `std of z = ${sd.toFixed(2)}`);
}

// 2. The browser's kappa agrees with the Python calibration that produced the assumed range.
const grid = new globalThis.PandoraModel.PixelGrid(161);
for (const layout of ["clustered", "typical", "spread"]) {
  const truth = S.buildTruth({ key: "M", layout, size: 1, visits: 1 }, grid);
  const py = layout === "typical" ? Cal.typical_layout_kappa.M : Cal.stars.M.named_layouts[layout];
  check(`JS kappa matches Python calibration: ${layout}`, Math.abs(truth.kappa / py - 1) < 2e-3,
    `JS ${truth.kappa.toFixed(3)} vs Python ${py}`);
}

// 2b. The named layouts never put a spot in the planet's path, at any size the page allows.
for (const layout of ["clustered", "typical", "spread"]) {
  for (const size of [0.5, 1, 1.25]) {
    const truth = S.buildTruth({ key: "M", layout, size, visits: 10 }, grid);
    check(`clear planet path: ${layout} at ${size}x over 10 visits`, truth.shadowOnSpots === 0, `shadow on spots ${truth.shadowOnSpots}`);
  }
}

// 3. With no stellar signal the correction changes nothing.
{
  const nl = S.nirWavelengths.length, flat = Array.from({ length: 30 }, (_, i) => i * 0.1);
  const out = C.correctSpectra({
    perVisit: [new Float64Array(nl).fill(0.005)], transitTimes: [1.5],
    vis: { t: flat, v: flat.map(() => 1), sigma: 1e-4 }, periodDays: 4,
    kappa: Cal.stars.M, shape: S.contrastShape("M", S.nirWavelengths), rng: C.mulberry32(3),
  });
  check("flat visible light curve leaves the spectrum unchanged", out.corrected.every((x) => Math.abs(x - 0.005) < 1e-12));
}

// 4. If the layout is the one the assumption describes, the correction removes most of the bias.
// 5. If it is not, the correction falls short or overshoots, and the band does not hide that.
const bias = (truth, spec) => S.errorStats(spec, truth).mean;
const run = (layout, visits = 8, key = "M") => {
  const truth = S.buildTruth({ key, layout, size: 1, visits }, grid);
  const obs = S.observe(truth, 0, 1); // noise-free: isolates the method's own error
  const fix = S.correct(truth, obs, 1);
  return { truth, before: bias(truth, obs.measured), after: bias(truth, fix.corrected), fix };
};
{
  const r = run("typical");
  check("typical layout: bias is at least 4x smaller after correction", Math.abs(r.after) < Math.abs(r.before) / 4,
    `${r.before.toFixed(2)} % -> ${r.after.toFixed(2)} %`);
  const inside = r.fix.corrected.every((x, l) => x >= r.fix.lo[l] - 1e-12 && x <= r.fix.hi[l] + 1e-12);
  check("typical layout: central estimate lies inside its own band", inside);
}
{
  const r = run("typical", 8, "K");
  check("K dwarf, typical layout: bias is at least 4x smaller after correction", Math.abs(r.after) < Math.abs(r.before) / 4,
    `${r.before.toFixed(2)} % -> ${r.after.toFixed(2)} %`);
}
{
  const r = run("spread");
  check("spread layout: most of the bias remains (the documented failure)", Math.abs(r.after) > 0.6 * Math.abs(r.before),
    `${r.before.toFixed(2)} % -> ${r.after.toFixed(2)} %`);
}
{
  const r = run("clustered");
  check("clustered layout: the correction overshoots past the truth", r.after < 0 && Math.abs(r.after) > 0.3 * Math.abs(r.before),
    `${r.before.toFixed(2)} % -> ${r.after.toFixed(2)} %`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
