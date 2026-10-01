(function () {
  "use strict";
  const M = PandoraModel, P = PandoraPresets;
  const grid = new M.PixelGrid(241);
  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const specChart = new PandoraPlots.Chart($("spec"), { aspect: 0.62 });
  const lcChart = new PandoraPlots.Chart($("lc"), { aspect: 0.3 });

  const WL = P.wavelengths, PICK = [0.6, 1.3], HALF_WINDOW = 0.06;
  const nearest = (w) => WL.reduce((best, v, i) => (Math.abs(v - w) < Math.abs(WL[best] - w) ? i : best), 0);
  const clone = (fs) => fs.map((f) => ({ ...f }));
  const state = { star: "M", rp: P.planet.rp0, b: 0.2, features: clone(P.stars.M.features) };
  const cleanCache = {};

  const simulate = (star, wl, times) => M.simulateTransit({
    star, spectra: P.spectra(state.star, wl), orbit: P.orbit(state.star, state.b),
    rp: P.radiusRatios(wl, state.rp), times, ld: P.limbDarkening(wl), grid,
  });
  const pct = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d) + " %";

  function compute() {
    const pr = P.stars[state.star];
    const star = { features: state.features, inclination: 90, obliquity: 0, prot: pr.prot };
    const bare = { ...star, features: [] };

    // Spectrum at mid-transit
    const clean = simulate(bare, WL, [0]), seen = simulate(star, WL, [0]);
    const depth = (sim) => Array.from(sim.flux[0], (f, l) => 1 - f / sim.starFlux[0][l]);
    const trueD = depth(clean), seenD = depth(seen);

    // Light curves at two wavelengths; the clean ones only change with star, planet and path
    const times = P.linspace(-HALF_WINDOW, HALF_WINDOW, 61);
    const key = [state.star, state.rp, state.b].join("|");
    const norm = (sim) => PICK.map((_, l) => sim.flux.map((f, i) => f[l] / sim.starFlux[i][l]));
    cleanCache[key] ??= norm(simulate(bare, PICK, times));
    const cleanLC = cleanCache[key], seenLC = norm(simulate(star, PICK, times));

    // How much of the planet's shadow lies on spots or faculae at mid-transit
    const labels = grid.labels(M.featureCenters(star, 0), star.features);
    const [xp, yp] = M.orbitPosition(P.orbit(state.star, state.b), 0);
    const rpVis = P.radiusRatios([0.6], state.rp);
    const occ = grid.occultedMoments(labels, xp, yp, rpVis);
    const total = occ[0] + occ[3] + occ[6];
    const onSpot = occ[3] / total, onFac = occ[6] / total;

    draw({ trueD, seenD, cleanLC, seenLC, times, labels, xp, yp, rp: rpVis[0], seen, onSpot, onFac });
  }

  function draw(r) {
    const i6 = nearest(PICK[0]), i13 = nearest(PICK[1]);
    const bias = (l) => r.seenD[l] / r.trueD[l] - 1;
    $("biasVis").textContent = pct(bias(i6));
    $("biasNir").textContent = pct(bias(i13));
    $("covVis").textContent = "spots + faculae cover " + ((r.seen.coverage[0][1][i6] + r.seen.coverage[0][2][i6]) * 100).toFixed(1) + " % of the star's light";
    $("covNir").textContent = "spots + faculae cover " + ((r.seen.coverage[0][1][i13] + r.seen.coverage[0][2][i13]) * 100).toFixed(1) + " % of the star's light";
    const crossing = r.onSpot + r.onFac > 1e-9;
    $("path").textContent = crossing ? "Crosses a feature" : "Clean";
    $("pathNote").textContent = crossing
      ? (r.onSpot * 100).toFixed(0) + " % of the shadow is on spots, " + (r.onFac * 100).toFixed(0) + " % on faculae"
      : "the planet blocks only ordinary surface";

    $("spec").setAttribute("aria-label", "Transit depth against wavelength from 0.4 to 1.65 micron, true and as measured. " +
      "The measured depth is " + $("biasVis").textContent.replace("−", "minus ") + " off at 0.6 micron and " +
      $("biasNir").textContent.replace("−", "minus ") + " off at 1.3 micron. " + $("path").textContent + " planet path.");
    const ink = css("--true"), obs = css("--observed");
    const d100 = (a) => a.map((v) => v * 100);
    const all = [...d100(r.trueD), ...d100(r.seenD)];
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.15 + 1e-4;
    specChart.draw({
      xlim: [WL[0], WL[WL.length - 1]], ylim: [lo - pad, hi + pad],
      xlabel: "wavelength (µm)", ylabel: "transit depth (%)",
      series: [
        { x: WL, y: d100(r.trueD), color: ink, dash: [7, 5] },
        { x: WL, y: d100(r.seenD), color: obs, width: 3 },
      ],
      legend: [{ color: ink, dash: [7, 5], label: "true (spotless star)" }, { color: obs, label: "as measured" }],
      bars: [
        { x0: P.bands.visible[0], x1: P.bands.visible[1], color: css("--band-vis"), label: "Pandora visible", short: "Visible" },
        { x0: P.bands.nir[0], x1: P.bands.nir[1], color: css("--band-nir"), label: "Pandora near-IR", short: "Near-IR" },
      ],
    });

    const cv = css("--visible"), cn = css("--nir");
    const pc = (a) => a.map((v) => (v - 1) * 100);
    const lcAll = [...pc(r.seenLC[0]), ...pc(r.seenLC[1]), ...pc(r.cleanLC[0]), ...pc(r.cleanLC[1])];
    const lcLo = Math.min(...lcAll), hours = Array.from(r.times, (t) => t * 24);
    lcChart.draw({
      xlim: [-HALF_WINDOW * 24, HALF_WINDOW * 24], ylim: [lcLo * 1.1, Math.max(-lcLo * 0.05, 0.02)],
      xlabel: "hours from mid-transit", ylabel: "change in brightness (%)",
      series: [
        { x: hours, y: pc(r.cleanLC[0]), color: cv, dash: [6, 5], width: 1.8 },
        { x: hours, y: pc(r.cleanLC[1]), color: cn, dash: [6, 5], width: 1.8 },
        { x: hours, y: pc(r.seenLC[0]), color: cv, width: 3 },
        { x: hours, y: pc(r.seenLC[1]), color: cn, width: 3 },
      ],
      legend: [
        { color: cv, label: "0.6 µm (visible)" }, { color: cn, label: "1.3 µm (near-IR)" },
        { color: css("--muted"), dash: [6, 5], label: "dashed: spotless star" },
      ],
    });

    $("lc").setAttribute("aria-label", "Transit light curves at 0.6 and 1.3 micron, " + (r.onSpot + r.onFac > 1e-9
      ? "with a brightening bump in the middle where the planet crosses a spot or facula." : "each a smooth dip, with the path clear of spots."));
    PandoraStarView.drawStar($("star"), grid, state.star, r.labels, { x: r.xp, y: r.yp, r: r.rp });
    $("star").setAttribute("aria-label", "The star at mid-transit. " + $("path").textContent + " planet path. " +
      "Depth error " + $("biasVis").textContent + " at 0.6 micron and " + $("biasNir").textContent + " at 1.3 micron.");
  }

  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; compute(); }); } };

  function slider(label, unit, min, max, step, value, onInput) {
    const wrap = document.createElement("div"); wrap.className = "field";
    const id = "f" + Math.random().toString(36).slice(2, 8);
    const lab = document.createElement("label"); lab.htmlFor = id; lab.textContent = label;
    const out = document.createElement("output"); out.htmlFor = id;
    const inp = document.createElement("input");
    Object.assign(inp, { id, type: "range", min, max, step, value });
    const show = () => (out.textContent = inp.value + unit);
    inp.addEventListener("input", () => { show(); onInput(+inp.value); });
    show(); wrap.append(lab, out, inp);
    return wrap;
  }

  function renderFeatures() {
    const host = $("features"); host.replaceChildren();
    state.features.forEach((f, i) => {
      const box = document.createElement("div"); box.className = "feature";
      const head = document.createElement("header");
      const name = document.createElement("span");
      const badge = document.createElement("span"); badge.className = "badge " + f.kind;
      name.append(badge, (f.kind === "spot" ? "Spot " : "Faculae ") + (i + 1));
      const del = document.createElement("button"); del.type = "button"; del.className = "ghost"; del.textContent = "Remove";
      del.setAttribute("aria-label", "Remove " + name.textContent);
      del.addEventListener("click", () => { state.features.splice(i, 1); renderFeatures(); schedule(); });
      head.append(name, del);
      box.append(head,
        slider("Latitude", "°", -80, 80, 1, f.lat, (v) => { f.lat = v; schedule(); }),
        slider("Longitude (0° faces us)", "°", -90, 90, 1, f.lon, (v) => { f.lon = v; schedule(); }),
        slider("Size (angular radius)", "°", 3, 30, 1, f.radius, (v) => { f.radius = v; schedule(); }));
      host.append(box);
    });
    if (!state.features.length) {
      const p = document.createElement("p"); p.style.cssText = "color:var(--muted);font-size:.9rem";
      p.textContent = "No spots: the measured spectrum equals the true one."; host.append(p);
    }
  }

  function syncPlanetControls() {
    $("rp").value = state.rp; $("rpOut").textContent = state.rp.toFixed(3);
    $("b").value = state.b; $("bOut").textContent = state.b.toFixed(2);
    $("starBlurb").textContent = P.stars[state.star].blurb + ", spots " + P.stars[state.star].teff.spot + " K, faculae " + P.stars[state.star].teff.fac + " K";
  }

  $("rp").addEventListener("input", (e) => { state.rp = +e.target.value; syncPlanetControls(); schedule(); });
  $("b").addEventListener("input", (e) => { state.b = +e.target.value; syncPlanetControls(); schedule(); });
  document.querySelectorAll("[data-star]").forEach((btn) => btn.addEventListener("click", () => {
    state.star = btn.dataset.star;
    document.querySelectorAll("[data-star]").forEach((o) => o.setAttribute("aria-pressed", o === btn));
    syncPlanetControls(); schedule();
  }));
  const add = (kind) => () => {
    if (state.features.length >= 6) return;
    state.features.push({ kind, lat: kind === "spot" ? -20 : 25, lon: kind === "spot" ? 50 : -50, radius: 10 });
    renderFeatures(); schedule();
  };
  $("addSpot").addEventListener("click", add("spot"));
  $("addFac").addEventListener("click", add("faculae"));
  $("inPath").addEventListener("click", () => {
    // A feature at longitude 0 and latitude asin(b) sits exactly on the planet's chord at mid-transit.
    const lat = Math.round((Math.asin(state.b) * 180) / Math.PI);
    let f = state.features.find((x) => x.kind === "spot");
    if (!f) { f = { kind: "spot" }; state.features.unshift(f); }
    Object.assign(f, { lat, lon: 0, radius: 14 });
    renderFeatures(); schedule();
  });
  $("reset").addEventListener("click", () => {
    state.rp = P.planet.rp0; state.b = 0.2; state.features = clone(P.stars[state.star].features);
    syncPlanetControls(); renderFeatures(); schedule();
  });

  syncPlanetControls(); renderFeatures(); compute();
})();
