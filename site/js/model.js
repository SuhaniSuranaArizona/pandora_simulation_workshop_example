/* Reference-model port: pixelated spotted star, transit, and the analytic TLSE epsilon.
 *
 * A line-for-line port of src/pandora_sim (surface.py, transit.py, tlse.py, spectra.py,
 * planet.py). tests/js/check_reference.mjs compares it with saved Python output.
 * A classic script, so it works when the page is opened straight from disk.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PandoraModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PHOT = 0, SPOT = 1, FAC = 2;
  const KIND = { spot: SPOT, faculae: FAC };
  const PLANCK_H = 6.62607015e-34, LIGHT_C = 2.99792458e8, BOLTZ_K = 1.380649e-23;
  const clip = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Planck flux density (arbitrary units are fine: only ratios matter). */
  function blackbody(wavelengthUm, teff) {
    const lam = wavelengthUm * 1e-6;
    return (2 * PLANCK_H * LIGHT_C * LIGHT_C) / Math.pow(lam, 5) /
      Math.expm1((PLANCK_H * LIGHT_C) / (lam * BOLTZ_K * teff));
  }

  const WATER_BANDS = [[0.72, 0.015], [0.82, 0.02], [0.94, 0.03], [1.13, 0.04], [1.40, 0.06]];

  /** Illustrative Rp/Rs(lambda): flat baseline, water bands and a lambda^-4 haze. */
  function waterHazeRadiusRatio(wavelengthUm, rp0, waterAmp, hazeAmp) {
    let water = 0;
    for (const [c, w] of WATER_BANDS) water += Math.exp(-0.5 * Math.pow((wavelengthUm - c) / w, 2));
    return rp0 * (1 + waterAmp * water + hazeAmp * Math.pow(wavelengthUm / 0.5, -4));
  }

  /** Analytic correction factor: observed depth of a clean chord = true depth * epsilon. */
  function epsilon(fSpot, fFac, sSpot, sFac, sPhot) {
    return 1 / (1 - fSpot * (1 - sSpot / sPhot) - fFac * (1 - sFac / sPhot));
  }

  /** Unit vectors of feature centres in the sky frame, flat [x0,y0,z0,x1,...]. */
  function featureCenters(star, tDays) {
    const theta = ((90 - star.inclination) * Math.PI) / 180;
    const psi = ((star.obliquity || 0) * Math.PI) / 180;
    const prot = star.prot === undefined ? Infinity : star.prot;
    const out = new Float64Array(3 * star.features.length);
    star.features.forEach((f, k) => {
      const lat = (f.lat * Math.PI) / 180;
      const lon = ((f.lon + (360 * tDays) / prot) * Math.PI) / 180;
      const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      const y1 = y * Math.cos(theta) - z * Math.sin(theta);
      const z1 = y * Math.sin(theta) + z * Math.cos(theta);
      out[3 * k] = x * Math.cos(psi) - y1 * Math.sin(psi);
      out[3 * k + 1] = x * Math.sin(psi) + y1 * Math.cos(psi);
      out[3 * k + 2] = z1;
    });
    return out;
  }

  /** Square pixel grid over [-1,1]^2 with anti-aliased stellar and planetary edges. */
  class PixelGrid {
    constructor(n) {
      this.n = n;
      const h = (this.h = 2 / n), N = n * n;
      this.x = new Float64Array(N); this.y = new Float64Array(N);
      this.nx = new Float64Array(N); this.ny = new Float64Array(N); this.nz = new Float64Array(N);
      this.W = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
      for (let j = 0; j < n; j++) {
        const y = (j + 0.5) * h - 1;
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * h - 1, idx = j * n + i;
          const rho = Math.hypot(x, y);
          const width = Math.max((h * (Math.abs(x) + Math.abs(y))) / Math.max(rho, 1e-12), 1e-12);
          const area = clip(0.5 + (1 - rho) / width, 0, 1);
          const mu = Math.sqrt(clip(1 - rho * rho, 0, 1));
          const scale = rho > 1 ? 1 / Math.max(rho, 1e-12) : 1;
          const om = 1 - mu;
          this.x[idx] = x; this.y[idx] = y;
          this.nx[idx] = x * scale; this.ny[idx] = y * scale; this.nz[idx] = mu;
          this.W[0][idx] = area; this.W[1][idx] = area * om; this.W[2][idx] = area * om * om;
        }
      }
      this._scratch = new Int8Array(N);
    }

    /** Component label (PHOT/SPOT/FAC) of every pixel. The returned buffer is reused. */
    labels(centers, features) {
      const lab = this._scratch, N = lab.length;
      lab.fill(0);
      features.forEach((f, k) => {
        const cx = centers[3 * k], cy = centers[3 * k + 1], cz = centers[3 * k + 2];
        const cr = Math.cos((f.radius * Math.PI) / 180), kind = KIND[f.kind];
        for (let p = 0; p < N; p++) {
          if (this.nx[p] * cx + this.ny[p] * cy + this.nz[p] * cz > cr) lab[p] = kind;
        }
      });
      return lab;
    }

    /** sum w (1-mu)^k per component, flat [c*3+k]. */
    componentMoments(labels) {
      const out = new Float64Array(9), N = labels.length, h2 = this.h * this.h;
      for (let p = 0; p < N; p++) {
        const c = labels[p];
        out[3 * c] += this.W[0][p]; out[3 * c + 1] += this.W[1][p]; out[3 * c + 2] += this.W[2][p];
      }
      for (let i = 0; i < 9; i++) out[i] *= h2;
      return out;
    }

    /** Moments of pixels under the planet, one per radius, flat [l*9 + c*3 + k]. */
    occultedMoments(labels, xp, yp, rp) {
      const nl = rp.length, out = new Float64Array(nl * 9), { h, n } = this;
      let rmax = 0;
      for (let l = 0; l < nl; l++) rmax = Math.max(rmax, rp[l]);
      const x0 = Math.max(Math.floor((xp - rmax + 1) / h) - 1, 0);
      const x1 = Math.min(Math.ceil((xp + rmax + 1) / h) + 1, n);
      const y0 = Math.max(Math.floor((yp - rmax + 1) / h) - 1, 0);
      const y1 = Math.min(Math.ceil((yp + rmax + 1) / h) + 1, n);
      if (x0 >= x1 || y0 >= y1) return out;
      const h2 = h * h;
      for (let j = y0; j < y1; j++) {
        for (let i = x0; i < x1; i++) {
          const p = j * n + i;
          const dx = this.x[p] - xp, dy = this.y[p] - yp, d = Math.hypot(dx, dy);
          if (d > rmax + 2 * h) continue;
          const width = Math.max((h * (Math.abs(dx) + Math.abs(dy))) / Math.max(d, 1e-12), 1e-12);
          const base = 3 * labels[p], w0 = this.W[0][p], w1 = this.W[1][p], w2 = this.W[2][p];
          for (let l = 0; l < nl; l++) {
            const cover = clip(0.5 + (rp[l] - d) / width, 0, 1);
            if (cover === 0) continue;
            const o = l * 9 + base;
            out[o] += cover * w0; out[o + 1] += cover * w1; out[o + 2] += cover * w2;
          }
        }
      }
      for (let i = 0; i < out.length; i++) out[i] *= h2;
      return out;
    }
  }

  /** Planet position in stellar radii; z > 0 means in front of the star. */
  function orbitPosition(orbit, tDays) {
    const phase = (2 * Math.PI * (tDays - (orbit.t0 || 0))) / orbit.period;
    const inc = (orbit.inc * Math.PI) / 180, a = orbit.aOverRs;
    return [a * Math.sin(phase), a * Math.cos(inc) * Math.cos(phase), a * Math.sin(inc) * Math.cos(phase)];
  }

  /**
   * Simulate a transit at every wavelength of spectra.
   * spectra: {wavelength, phot, spot, fac} (arrays, micron). rp: one Rp/Rs per wavelength.
   * ld: {u1, u2} arrays per wavelength. Fluxes are relative to the immaculate star.
   * Returns {times, wavelengths, flux[t], starFlux[t], coverage[t][component]} (Float64Arrays).
   */
  function simulateTransit({ star, spectra, orbit, rp, times, ld, grid }) {
    const nl = spectra.wavelength.length, S = [spectra.phot, spectra.spot, spectra.fac];
    const u1 = ld.u1, u2 = ld.u2;
    const weights = (m) => {
      const w = [new Float64Array(nl), new Float64Array(nl), new Float64Array(nl)];
      for (let c = 0; c < 3; c++)
        for (let l = 0; l < nl; l++) w[c][l] = m[3 * c] - u1[l] * m[3 * c + 1] - u2[l] * m[3 * c + 2];
      return w;
    };
    const immaculate = grid.componentMoments(new Int8Array(grid.n * grid.n));
    const wImm = weights(immaculate)[0];
    const fImm = Float64Array.from(wImm, (w, l) => S[0][l] * w);

    const out = { times: Float64Array.from(times), wavelengths: spectra.wavelength, flux: [], starFlux: [], coverage: [] };
    for (const t of times) {
      const labels = grid.labels(featureCenters(star, t), star.features);
      const w = weights(grid.componentMoments(labels));
      const starFlux = new Float64Array(nl), cov = [new Float64Array(nl), new Float64Array(nl), new Float64Array(nl)];
      for (let l = 0; l < nl; l++) {
        const tot = w[0][l] + w[1][l] + w[2][l];
        starFlux[l] = S[0][l] * w[0][l] + S[1][l] * w[1][l] + S[2][l] * w[2][l];
        for (let c = 0; c < 3; c++) cov[c][l] = w[c][l] / tot;
      }
      const flux = Float64Array.from(starFlux);
      const [xp, yp, zp] = orbitPosition(orbit, t);
      if (zp > 0) {
        const occ = grid.occultedMoments(labels, xp, yp, rp);
        for (let l = 0; l < nl; l++) {
          let removed = 0;
          for (let c = 0; c < 3; c++) {
            const o = l * 9 + 3 * c;
            removed += S[c][l] * (occ[o] - u1[l] * occ[o + 1] - u2[l] * occ[o + 2]);
          }
          flux[l] -= removed;
        }
      }
      for (let l = 0; l < nl; l++) { flux[l] /= fImm[l]; starFlux[l] /= fImm[l]; }
      out.flux.push(flux); out.starFlux.push(starFlux); out.coverage.push(cov);
    }
    return out;
  }

  return { PHOT, SPOT, FAC, blackbody, waterHazeRadiusRatio, epsilon, featureCenters, PixelGrid, orbitPosition, simulateTransit };
});
