(function () {
  "use strict";
  const M = PandoraModel, P = PandoraPresets;
  const grid = new M.PixelGrid(241);
  const $ = (id) => document.getElementById(id);
  const chart = new PandoraPlots.Chart($("lc"), { aspect: 0.5 });
  const HALF_WINDOW = 0.06; // days either side of mid-transit
  const WL = [0.6];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = { star: "M", size: 1.5, t: -HALF_WINDOW, playing: !reduceMotion };
  let curve = null;

  const scaledStar = () => ({
    features: P.stars[state.star].features.map((f) => ({ ...f, radius: Math.min(90, f.radius * state.size) })),
    inclination: 90, obliquity: 0, prot: P.stars[state.star].prot,
  });
  const run = (star, times) => M.simulateTransit({
    star, spectra: P.spectra(state.star, WL), orbit: P.orbit(state.star, 0.2),
    rp: P.radiusRatios(WL, P.planet.rp0), times, ld: P.limbDarkening(WL), grid,
  });

  function recompute() {
    const times = P.linspace(-HALF_WINDOW, HALF_WINDOW, 121);
    const star = scaledStar();
    const spotted = star.features.some((f) => f.radius > 0.5) ? run(star, times) : run({ ...star, features: [] }, times);
    const clean = run({ ...star, features: [] }, times);
    // Divide by the star's own brightness at each moment, so only the planet's dip remains.
    const norm = (sim) => sim.flux.map((f, i) => f[0] / sim.starFlux[i][0]);
    curve = { hours: Array.from(times, (t) => t * 24), clean: norm(clean), spotted: norm(spotted) };
    const mid = 60;
    const dc = 1 - curve.clean[mid], ds = 1 - curve.spotted[mid];
    $("dClean").textContent = (dc * 100).toFixed(3) + " %";
    $("dSpot").textContent = (ds * 100).toFixed(3) + " %";
    $("dOver").textContent = ((ds / dc - 1) * 100).toFixed(1) + " %";
    $("lc").setAttribute("aria-label", "Transit light curve at 0.6 micron over " + (2 * HALF_WINDOW * 24).toFixed(1) +
      " hours. The spotless star dips by " + (dc * 100).toFixed(3) + " per cent; the spotted star dips by " + (ds * 100).toFixed(3) +
      " per cent, which is " + ((ds / dc - 1) * 100).toFixed(1) + " per cent deeper.");
    draw();
  }

  function draw() {
    if (!curve) return;
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const pct = (a) => a.map((v) => (v - 1) * 100);
    const lo = Math.min(...pct(curve.spotted), ...pct(curve.clean));
    chart.draw({
      xlim: [-HALF_WINDOW * 24, HALF_WINDOW * 24], ylim: [lo * 1.12, Math.max(0.04 * -lo, 0.02)],
      xlabel: "hours from mid-transit", ylabel: "change in brightness (%)",
      series: [
        { x: curve.hours, y: pct(curve.clean), color: css("--true"), dash: [7, 5], width: 2.5 },
        { x: curve.hours, y: pct(curve.spotted), color: css("--observed"), width: 3 },
      ],
      vlines: [{ x: state.t * 24, color: css("--muted"), dash: [2, 3] }],
      legend: [
        { color: css("--true"), dash: [7, 5], label: "spotless star" },
        { color: css("--observed"), label: "spotted star" },
      ],
    });
    const star = scaledStar();
    const labels = grid.labels(M.featureCenters(star, state.t), star.features);
    const [x, y] = M.orbitPosition(P.orbit(state.star, 0.2), state.t);
    PandoraStarView.drawStar($("star"), grid, state.star, labels, { x, y, r: P.planet.rp0 });
  }

  let last = null;
  function frame(now) {
    if (state.playing) {
      if (last !== null) {
        state.t += ((now - last) / 1000) * (2 * HALF_WINDOW / 7); // one pass in 7 s
        if (state.t > HALF_WINDOW) state.t = -HALF_WINDOW;
        $("time").value = state.t / HALF_WINDOW;
      }
      last = now;
      draw();
    } else last = null;
    requestAnimationFrame(frame);
  }

  function setPlaying(on) {
    state.playing = on;
    $("play").textContent = on ? "Pause" : "Play";
  }
  $("play").addEventListener("click", () => setPlaying(!state.playing));
  $("time").addEventListener("input", (e) => { setPlaying(false); state.t = +e.target.value * HALF_WINDOW; draw(); });
  $("size").addEventListener("input", (e) => {
    state.size = +e.target.value; $("sizeOut").textContent = state.size.toFixed(1) + "×"; recompute();
  });
  document.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", () => {
    state.star = b.dataset.star;
    document.querySelectorAll("[data-star]").forEach((o) => o.setAttribute("aria-pressed", o === b));
    recompute();
  }));

  setPlaying(state.playing);
  recompute();
  requestAnimationFrame(frame);
})();
