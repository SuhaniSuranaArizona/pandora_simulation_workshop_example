(function () {
  "use strict";
  const M = PandoraModel, S = PandoraScenario, Cal = PandoraCalibration;
  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const grid = new M.PixelGrid(161);
  const visChart = new PandoraPlots.Chart($("vis"), { aspect: 0.62 });
  const nirChart = new PandoraPlots.Chart($("nir"), { aspect: 0.62 });

  const state = { key: "M", layout: "typical", size: 1, visits: 6, noise: 1, seed: 1, fixed: false };
  const truthCache = new Map();
  const truthFor = () => {
    const id = [state.key, state.layout, state.size, state.visits].join("|");
    if (!truthCache.has(id)) {
      if (truthCache.size > 24) truthCache.delete(truthCache.keys().next().value);
      truthCache.set(id, S.buildTruth({ key: state.key, layout: state.layout, size: state.size, visits: state.visits }, grid));
    }
    return truthCache.get(id);
  };

  const pct = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + " %";

  function render() {
    const truth = truthFor(), obs = S.observe(truth, state.noise, state.seed);
    const fix = state.fixed ? S.correct(truth, obs, state.seed) : null;
    const wl = S.nirWavelengths, pc = (a) => Array.from(a, (x) => x * 100);

    // Numbers
    const before = S.errorStats(obs.measured, truth);
    $("errBefore").textContent = pct(before.mean);
    $("errBeforeN").textContent = "scatter " + before.rms.toFixed(1) + " % rms, true depth is the spotless star's";
    if (fix) {
      const after = S.errorStats(fix.corrected, truth);
      $("errAfter").textContent = pct(after.mean);
      $("errAfterN").textContent = "scatter " + after.rms.toFixed(1) + " % rms";
      $("says").textContent = (fix.amplitude * 100).toFixed(2) + " % wobble";
      $("saysN").textContent = "implies the star is dimmed by about " + (fix.dimmingAtTransits.reduce((a, b) => a + b, 0) / fix.dimmingAtTransits.length * 100).toFixed(1) + " % at 0.6 µm during the transits";
    } else {
      $("errAfter").textContent = "–"; $("errAfterN").textContent = "press Correct it";
      $("says").textContent = "–"; $("saysN").textContent = "press Correct it";
    }
    const k = Cal.stars[state.key], inside = truth.kappa >= k.p16 && truth.kappa <= k.p84;
    $("truth").textContent = "κ = " + truth.kappa.toFixed(2);
    $("truthN").innerHTML = "the method assumes " + k.p50.toFixed(2) + " (" + k.p16.toFixed(2) + " to " + k.p84.toFixed(2) + "): <span class=\"chip " + (inside ? "ok" : "bad") + "\">" + (inside ? "inside the range" : "outside the range") + "</span>";

    // Visible chart
    const vy = Array.from(obs.vis.v, (v) => (v - 1) * 100);
    const lo = Math.min(...vy), hi = Math.max(...vy), pad = (hi - lo) * 0.12 + 0.02;
    const tEnd = (state.visits - 1) * S.SPACING + 0.5;
    const fitSeries = [];
    if (fix) {
      const w = (2 * Math.PI) / S.PROT, f = fix.fit, tt = Array.from({ length: 240 }, (_, i) => -0.5 + ((tEnd + 0.5) * i) / 239);
      fitSeries.push({ x: tt, y: tt.map((t) => ((f.c0 + f.a * Math.cos(w * t) + f.b * Math.sin(w * t)) / f.c0 - 1) * 100), color: css("--fixed"), width: 2.5 });
    }
    visChart.draw({
      xlim: [-0.5, tEnd], ylim: [lo - pad, hi + pad], xlabel: "days", ylabel: "brightness change (%)",
      vlines: truth.transitTimes.map((t) => ({ x: t, color: css("--muted"), dash: [2, 4] })),
      points: [{ x: Array.from(obs.vis.t), y: vy, color: css("--visible"), r: 2.6, alpha: 0.8 }],
      series: fitSeries,
      legend: [{ color: css("--visible"), label: "visible data" }].concat(fix ? [{ color: css("--fixed"), label: "fitted wobble" }] : []),
    });

    // Infrared chart
    const td = pc(truth.trueDepth), md = pc(obs.measured), er = md.map(() => (obs.sigmaNir * 100));
    const all = [...td, ...md.map((v, i) => v - er[i]), ...md.map((v, i) => v + er[i])];
    const series = [{ x: wl, y: td, color: css("--true"), dash: [7, 5] }];
    const areas = [], legend = [{ color: css("--true"), dash: [7, 5], label: "true (spotless star)" }, { color: css("--observed"), label: "measured" }];
    if (fix) {
      series.push({ x: wl, y: pc(fix.corrected), color: css("--fixed"), width: 3 });
      areas.push({ x: wl, lo: pc(fix.lo), hi: pc(fix.hi), color: css("--fixed"), alpha: 0.2 });
      all.push(...pc(fix.lo), ...pc(fix.hi));
      legend.push({ color: css("--fixed"), label: "corrected, with range" });
    }
    const ylo = Math.min(...all), yhi = Math.max(...all), ypad = (yhi - ylo) * 0.08;
    nirChart.draw({
      xlim: [wl[0], wl[wl.length - 1]], ylim: [ylo - ypad, yhi + ypad], xlabel: "wavelength (µm)", ylabel: "transit depth (%)",
      areas, series, legend,
      errors: [{ x: wl, y: md, err: er, color: css("--observed") }],
      points: [{ x: wl, y: md, color: css("--observed"), r: 3 }],
    });

    $("vis").setAttribute("aria-label", "Visible brightness of the star over " + state.visits + " visits, rising and falling by about " +
      (Math.hypot(0, (Math.max(...vy) - Math.min(...vy)) / 2)).toFixed(2) + " per cent as spots rotate." + (fix ? " A fitted wobble is overlaid." : ""));
    $("nir").setAttribute("aria-label", "Infrared transit depth against wavelength. The measured spectrum is " + $("errBefore").textContent.replace("−", "minus ") +
      " off the true one on average." + (fix ? " After correction it is " + $("errAfter").textContent.replace("−", "minus ") + " off, and the hidden true spot-layout factor is " + (inside ? "inside" : "outside") + " the assumed range." : ""));
    $("fix").textContent = state.fixed ? "Undo correction" : "Correct it";
    $("fix").setAttribute("aria-pressed", state.fixed);
    $("visits").closest(".field").querySelector("output").textContent = state.visits;
  }

  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } };

  const bind = (id, outId, key, fmt) => {
    $(id).addEventListener("input", (e) => { state[key] = +e.target.value; $(outId).textContent = fmt(state[key]); schedule(); });
    $(outId).textContent = fmt(state[key]);
  };
  bind("size", "sizeOut", "size", (v) => v.toFixed(2) + "×");
  bind("visits", "visitsOut", "visits", (v) => String(v));
  bind("noise", "noiseOut", "noise", (v) => v.toFixed(2) + "×");

  const seg = (selector, prop, key) => document.querySelectorAll(selector).forEach((btn) => btn.addEventListener("click", () => {
    state[key] = btn.dataset[prop];
    document.querySelectorAll(selector).forEach((o) => o.setAttribute("aria-pressed", o === btn));
    schedule();
  }));
  seg("[data-layout]", "layout", "layout");
  seg("[data-star]", "star", "key");
  $("fix").addEventListener("click", () => { state.fixed = !state.fixed; schedule(); });
  $("reseed").addEventListener("click", () => { state.seed += 1; schedule(); });

  const k = Cal.stars.M;
  $("kMed").textContent = k.p50.toFixed(2); $("kLo").textContent = k.p16.toFixed(2); $("kHi").textContent = k.p84.toFixed(2);
  render();
})();
