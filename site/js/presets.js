/* Star, planet and orbit presets for the explainer. Illustrative round numbers, not fits to any real system. */
(function (root) {
  "use strict";
  const M = root.PandoraModel;

  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
  const wavelengths = linspace(0.4, 1.65, 51); // micron

  const stars = {
    M: {
      label: "M dwarf", blurb: "3500 K photosphere",
      teff: { phot: 3500, spot: 3100, fac: 3600 }, aOverRs: 14, period: 3, prot: 12,
      color: [255, 140, 70],
      features: [
        { kind: "spot", lat: 35, lon: -25, radius: 14 },
        { kind: "spot", lat: -30, lon: 30, radius: 10 },
        { kind: "faculae", lat: 50, lon: 40, radius: 12 },
      ],
    },
    K: {
      label: "K dwarf", blurb: "4500 K photosphere",
      teff: { phot: 4500, spot: 3900, fac: 4600 }, aOverRs: 9, period: 3, prot: 12,
      color: [255, 185, 110],
      features: [
        { kind: "spot", lat: 35, lon: -25, radius: 14 },
        { kind: "spot", lat: -30, lon: 30, radius: 10 },
        { kind: "faculae", lat: 50, lon: 40, radius: 12 },
      ],
    },
  };

  // One made-up planet: flat baseline, water-like bands, no haze.
  const planet = { rp0: 0.06, waterAmp: 0.05, hazeAmp: 0 };

  // Pandora's two channels (micron), from Rotman et al. 2026, arXiv:2603.04488: visible photometry 0.4-0.7,
  // near-infrared spectroscopy 0.9-1.6.
  const bands = { visible: [0.4, 0.7], nir: [0.9, 1.6] };

  const cache = {};
  function spectra(key, wl) {
    const id = key + ":" + wl.join(",");
    if (!cache[id]) {
      const t = stars[key].teff;
      cache[id] = {
        wavelength: wl,
        phot: wl.map((w) => M.blackbody(w, t.phot)),
        spot: wl.map((w) => M.blackbody(w, t.spot)),
        fac: wl.map((w) => M.blackbody(w, t.fac)),
      };
    }
    return cache[id];
  }

  // Quadratic limb darkening that weakens toward the infrared.
  const limbDarkening = (wl) => ({
    u1: wl.map((w) => 0.65 + ((0.2 - 0.65) * (w - 0.45)) / 1.2),
    u2: wl.map((w) => 0.25 + ((0.1 - 0.25) * (w - 0.45)) / 1.2),
  });

  const orbit = (key, b) => {
    const a = stars[key].aOverRs;
    return { period: stars[key].period, aOverRs: a, inc: (Math.acos(b / a) * 180) / Math.PI, t0: 0 };
  };

  const radiusRatios = (wl, rp0) => wl.map((w) => M.waterHazeRadiusRatio(w, rp0, planet.waterAmp, planet.hazeAmp));

  root.PandoraPresets = { linspace, wavelengths, stars, planet, bands, spectra, limbDarkening, orbit, radiusRatios };
})(typeof self !== "undefined" ? self : globalThis);
