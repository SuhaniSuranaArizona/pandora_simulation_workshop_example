// Compares site/js/model.js with the saved Python output. Run: node tests/js/check_reference.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const M = createRequire(import.meta.url)(join(here, "../../site/js/model.js"));
const cases = JSON.parse(readFileSync(join(here, "../reference/cases.json"), "utf8"));
const TOL = 1e-9;

let failed = false;
const grids = {};
for (const c of cases) {
  const wl = c.wavelength;
  const spectra = {
    wavelength: wl,
    phot: wl.map((w) => M.blackbody(w, c.teffs[0])),
    spot: wl.map((w) => M.blackbody(w, c.teffs[1])),
    fac: wl.map((w) => M.blackbody(w, c.teffs[2])),
  };
  const star = { ...c.star, prot: c.star.prot ?? Infinity };
  const rp = wl.map((w) => M.waterHazeRadiusRatio(w, c.planet.rp0, c.planet.waterAmp, c.planet.hazeAmp));
  grids[c.grid_n] ??= new M.PixelGrid(c.grid_n);
  const sim = M.simulateTransit({ star, spectra, orbit: c.orbit, rp, times: c.times, ld: c.ld, grid: grids[c.grid_n] });

  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  let worstRp = Math.max(...rp.map((v, l) => rel(v, c.rp[l])));
  let worst = { flux: 0, starFlux: 0, coverage: 0 };
  c.times.forEach((_, i) => {
    wl.forEach((_, l) => {
      worst.flux = Math.max(worst.flux, rel(sim.flux[i][l], c.expected.flux[i][l]));
      worst.starFlux = Math.max(worst.starFlux, rel(sim.starFlux[i][l], c.expected.starFlux[i][l]));
      for (let k = 0; k < 3; k++)
        worst.coverage = Math.max(worst.coverage, rel(sim.coverage[i][k][l], c.expected.coverage[i][k][l]));
    });
  });
  const ok = worstRp < TOL && Object.values(worst).every((v) => v < TOL);
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}\n      planet ${worstRp.toExponential(1)}  flux ${worst.flux.toExponential(1)}  starFlux ${worst.starFlux.toExponential(1)}  coverage ${worst.coverage.toExponential(1)}`);
}
console.log(failed ? "\nJavaScript does NOT match the Python reference" : `\nAll cases agree to better than ${TOL}`);
process.exit(failed ? 1 : 0);
