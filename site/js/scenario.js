/* Page-3 scenario: a hidden spotted star, several 24-hour visits, and the noisy data they produce. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PandoraScenario = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const root = typeof self !== "undefined" ? self : globalThis;
  const M = root.PandoraModel, P = root.PandoraPresets, C = root.PandoraCorrection, Cal = root.PandoraCalibration;

  const PROT = Cal.prot_days;      // stellar rotation period, days
  const SPACING = 3;               // days between the transits (the orbital period)
  const VISIT_HALF = 0.5;          // each visit is a 24 h stare centred on a transit
  const VISIT_POINTS = 25;         // hourly visible photometry
  const SIGMA_VIS = 400e-6;        // visible noise per point at noise = 1 (illustrative)
  const SIGMA_NIR = 120e-6;        // infrared depth noise per bin per visit at noise = 1 (illustrative)
  const IMPACT = 0.2;
  const VIS_WL = Cal.wavelength_um;
  const nirIndex = P.wavelengths.map((w, i) => i).filter((i) => P.wavelengths[i] >= P.bands.nir[0] - 1e-9 && P.wavelengths[i] <= P.bands.nir[1] + 1e-9);
  const nirWavelengths = nirIndex.map((i) => P.wavelengths[i]);

  const featuresFor = (layout, size) =>
    Cal.layouts[layout].map((f) => ({ ...f, radius: Math.min(60, Math.max(1, f.radius * size)) }));

  /** Spot contrast relative to the visible band: (1 - r_spot(l)) / (1 - r_spot(0.6 micron)). */
  function contrastShape(key, wl) {
    const t = P.stars[key].teff, r = (w) => M.blackbody(w, t.spot) / M.blackbody(w, t.phot);
    return Float64Array.from(wl, (w) => (1 - r(w)) / (1 - r(VIS_WL)));
  }

  const simulate = (key, star, wl, times, grid) => M.simulateTransit({
    star, spectra: P.spectra(key, wl), orbit: P.orbit(key, IMPACT), rp: P.radiusRatios(wl, P.planet.rp0),
    times, ld: P.limbDarkening(wl), grid,
  });

  /** Mean dimming over a rotation divided by the first-harmonic amplitude, as in scripts/calibrate_kappa.py. */
  function trueKappa(key, star, grid) {
    const n = 48, phase = Array.from({ length: n }, (_, i) => i / n);
    const sim = simulate(key, star, [VIS_WL], phase.map((p) => p * PROT), grid);
    const v = sim.starFlux.map((f) => f[0]), mean = v.reduce((a, b) => a + b, 0) / n;
    const fit = C.fitSinusoid(phase.map((p) => p * PROT), v.map((x) => x / mean), PROT, 1);
    return { kappa: (1 - mean) / (Math.hypot(fit.a, fit.b) / fit.c0), meanDimming: 1 - mean };
  }

  /** Largest share of the planet's shadow that lies on a spot at any of the transits (0 means a clean path). */
  function shadowOnSpots(key, star, transitTimes, grid) {
    const orbit = P.orbit(key, IMPACT), rp = P.radiusRatios([VIS_WL], P.planet.rp0);
    let worst = 0;
    for (const t of transitTimes) {
      const labels = grid.labels(M.featureCenters(star, t), star.features);
      const [x, y] = M.orbitPosition(orbit, t);
      const occ = grid.occultedMoments(labels, x, y, rp);
      worst = Math.max(worst, (occ[3] + occ[6]) / (occ[0] + occ[3] + occ[6]));
    }
    return worst;
  }

  /** The noise-free truth for one configuration: {key, layout, size, visits}. */
  function buildTruth({ key, layout, size, visits }, grid) {
    const star = { features: featuresFor(layout, size), inclination: 90, obliquity: 0, prot: PROT };
    const transitTimes = Array.from({ length: visits }, (_, k) => k * SPACING);
    const pick = (arr) => Float64Array.from(nirIndex, (i) => arr[i]);
    const depth = (sim, i) => pick(Array.from(sim.flux[i], (f, l) => 1 - f / sim.starFlux[i][l]));

    const clean = simulate(key, { ...star, features: [] }, P.wavelengths, [0], grid);
    const seen = simulate(key, star, P.wavelengths, transitTimes, grid);
    const visT = [];
    transitTimes.forEach((tk) => { for (let i = 0; i < VISIT_POINTS; i++) visT.push(tk - VISIT_HALF + (2 * VISIT_HALF * i) / (VISIT_POINTS - 1)); });
    const visSim = simulate(key, star, [VIS_WL], visT, grid); // planet-free flux: the transit is masked in real data too
    return {
      key, layout, size, visits, star, transitTimes, visT,
      visFlux: visSim.starFlux.map((f) => f[0]),
      trueDepth: depth(clean, 0),
      depthPerVisit: transitTimes.map((_, k) => depth(seen, k)),
      shadowOnSpots: shadowOnSpots(key, star, transitTimes, grid),
      ...trueKappa(key, star, grid),
    };
  }

  /** One noisy realisation of the two channels. noise scales both channels (1 = the illustrative baseline). */
  function observe(truth, noise, seed) {
    const rng = C.mulberry32(seed), n = truth.visFlux.length;
    const mean = truth.visFlux.reduce((a, b) => a + b, 0) / n, sigmaVis = SIGMA_VIS * noise;
    const vis = { t: truth.visT, v: truth.visFlux.map((f) => f / mean + sigmaVis * C.normal(rng)), sigma: sigmaVis };
    const sigmaNir = SIGMA_NIR * noise;
    const perVisit = truth.depthPerVisit.map((d) => Float64Array.from(d, (x) => x + sigmaNir * C.normal(rng)));
    const nl = nirIndex.length, measured = new Float64Array(nl);
    perVisit.forEach((d) => d.forEach((x, l) => (measured[l] += x / perVisit.length)));
    return { vis, perVisit, measured, sigmaNir: sigmaNir / Math.sqrt(perVisit.length) };
  }

  /** Correct the observation with the visible-anchored method. */
  function correct(truth, obs, seed) {
    return C.correctSpectra({
      perVisit: obs.perVisit, transitTimes: truth.transitTimes, vis: obs.vis, periodDays: PROT,
      kappa: Cal.stars[truth.key], shape: contrastShape(truth.key, nirWavelengths), rng: C.mulberry32(seed + 7919),
    });
  }

  /** Mean and rms of the fractional error of a spectrum against the truth, in per cent. */
  function errorStats(spectrum, truth) {
    const rel = Array.from(spectrum, (x, l) => (x - truth.trueDepth[l]) / truth.trueDepth[l]);
    const mean = rel.reduce((a, b) => a + b, 0) / rel.length;
    return { mean: mean * 100, rms: Math.sqrt(rel.reduce((a, b) => a + b * b, 0) / rel.length) * 100 };
  }

  return { PROT, SPACING, VIS_WL, nirWavelengths, featuresFor, contrastShape, trueKappa, buildTruth, observe, correct, errorStats };
});
