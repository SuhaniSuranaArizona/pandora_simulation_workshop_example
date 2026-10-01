/* The simplified visible-anchored correction used on page 3, as pure functions (no DOM).
 *
 * Idea: a rotation light curve in visible light shows how the star's brightness changes, and
 * spots are far more contrasty there than in the infrared. From the fitted modulation we
 * estimate the star's average dimming, which sets the correction epsilon for each infrared transit.
 *
 * The one assumption: the average dimming is kappa times the modulation amplitude. kappa comes
 * from a calibration over random spot layouts (scripts/calibrate_kappa.py), so its spread is the
 * honest uncertainty. A spot layout unlike the calibration sample breaks it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PandoraCorrection = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Small seeded generator so a "noise draw" can be repeated. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rng) {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  function invert3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  /**
   * Least-squares fit of v = c0 + a cos(w t) + b sin(w t) with known period and point noise sigma.
   * Returns {c0, a, b, cov} where cov is the 3x3 covariance (row-major) of (c0, a, b).
   */
  function fitSinusoid(t, v, periodDays, sigma) {
    const w = (2 * Math.PI) / periodDays, n = t.length;
    const ata = new Array(9).fill(0), atv = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const row = [1, Math.cos(w * t[i]), Math.sin(w * t[i])];
      for (let r = 0; r < 3; r++) {
        atv[r] += row[r] * v[i];
        for (let c = 0; c < 3; c++) ata[3 * r + c] += row[r] * row[c];
      }
    }
    const inv = invert3(ata);
    const beta = [0, 1, 2].map((r) => inv[3 * r] * atv[0] + inv[3 * r + 1] * atv[1] + inv[3 * r + 2] * atv[2]);
    return { c0: beta[0], a: beta[1], b: beta[2], cov: inv.map((x) => x * sigma * sigma) };
  }

  function cholesky3(m) {
    const L = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j <= i; j++) {
        let s = m[3 * i + j];
        for (let k = 0; k < j; k++) s -= L[3 * i + k] * L[3 * j + k];
        L[3 * i + j] = i === j ? Math.sqrt(Math.max(s, 1e-30)) : s / L[3 * j + j];
      }
    }
    return L;
  }

  const DIMMING_MAX = 0.6;

  /** Mean dimming at each transit epoch and the matching epsilon(lambda) for one set of fit values. */
  function epsilonAtTransits({ c0, a, b }, kappa, periodDays, transitTimes, shape) {
    const w = (2 * Math.PI) / periodDays, amp = Math.hypot(a, b) / c0, meanDimming = kappa * amp;
    return transitTimes.map((tk) => {
      const vNorm = (c0 + a * Math.cos(w * tk) + b * Math.sin(w * tk)) / c0;
      const d = Math.min(Math.max(1 - (1 - meanDimming) * vNorm, 0), DIMMING_MAX);
      return { dimming: d, epsilon: Float64Array.from(shape, (g) => 1 / (1 - d * g)) };
    });
  }

  function combine(perVisit, eps) {
    const nl = perVisit[0].length, out = new Float64Array(nl);
    for (let k = 0; k < perVisit.length; k++) for (let l = 0; l < nl; l++) out[l] += perVisit[k][l] / eps[k].epsilon[l];
    return out.map((x) => x / perVisit.length);
  }

  /**
   * Correct the infrared depths with the visible light curve.
   * perVisit[k][l]: measured depth of transit k at wavelength l. vis: {t, v, sigma}. kappa: {p16,p50,p84}.
   * shape[l]: spot contrast at lambda relative to the visible band, (1 - r_spot(l)) / (1 - r_spot(visible)).
   * Returns {corrected, lo, hi, fit, amplitude, dimmingAtTransits}; lo/hi bound the 16-84% range from the
   * fit noise and the spread of kappa.
   */
  function correctSpectra({ perVisit, transitTimes, vis, periodDays, kappa, shape, rng, nSamples = 300 }) {
    const fit = fitSinusoid(vis.t, vis.v, periodDays, vis.sigma);
    const central = epsilonAtTransits(fit, kappa.p50, periodDays, transitTimes, shape);
    const corrected = combine(perVisit, central);

    const L = cholesky3(fit.cov), mu = Math.log(kappa.p50), sd = Math.log(kappa.p84 / kappa.p16) / 2;
    const nl = shape.length, draws = Array.from({ length: nl }, () => new Float64Array(nSamples));
    for (let s = 0; s < nSamples; s++) {
      const z = [normal(rng), normal(rng), normal(rng)];
      const f = {
        c0: fit.c0 + L[0] * z[0],
        a: fit.a + L[3] * z[0] + L[4] * z[1],
        b: fit.b + L[6] * z[0] + L[7] * z[1] + L[8] * z[2],
      };
      const eps = epsilonAtTransits(f, Math.exp(mu + sd * normal(rng)), periodDays, transitTimes, shape);
      const c = combine(perVisit, eps);
      for (let l = 0; l < nl; l++) draws[l][s] = c[l];
    }
    const q = (arr, p) => Float64Array.from(arr).sort()[Math.min(nSamples - 1, Math.floor(p * nSamples))];
    return {
      corrected, fit, amplitude: Math.hypot(fit.a, fit.b) / fit.c0,
      lo: Float64Array.from(draws, (d) => q(d, 0.16)), hi: Float64Array.from(draws, (d) => q(d, 0.84)),
      dimmingAtTransits: central.map((c) => c.dimming),
    };
  }

  return { mulberry32, normal, fitSinusoid, epsilonAtTransits, correctSpectra };
});
