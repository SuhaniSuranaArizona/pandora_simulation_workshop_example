/* Draws the pixelated star and planet onto a canvas (one canvas pixel per model pixel). */
(function (root) {
  "use strict";
  const M = root.PandoraModel, P = root.PandoraPresets;

  /**
   * canvas: sized to grid.n x grid.n. labels: from grid.labels(). The planet is drawn at
   * (xp, yp) in stellar radii with radius rp. Brightness is shown at 0.6 micron.
   */
  function drawStar(canvas, grid, presetKey, labels, planet) {
    const n = grid.n, ctx = canvas.getContext("2d");
    const wl = [0.6], sp = P.spectra(presetKey, wl), ld = P.limbDarkening(wl);
    const ratio = [1, sp.spot[0] / sp.phot[0], sp.fac[0] / sp.phot[0]];
    const base = P.stars[presetKey].color, img = ctx.createImageData(n, n), d = img.data;
    for (let p = 0; p < labels.length; p++) {
      const om = 1 - grid.nz[p];
      const b = Math.min(1, (ratio[labels[p]] * (1 - ld.u1[0] * om - ld.u2[0] * om * om)) / 1.05);
      const g = Math.pow(b, 0.85);
      d[4 * p] = base[0] * g; d[4 * p + 1] = base[1] * g; d[4 * p + 2] = base[2] * g;
      d[4 * p + 3] = 255 * grid.W[0][p];
    }
    ctx.clearRect(0, 0, n, n);
    ctx.putImageData(img, 0, 0);
    if (planet) {
      const px = ((planet.x + 1) / 2) * n, py = ((1 - planet.y) / 2) * n; // canvas y points down
      ctx.beginPath();
      ctx.arc(px, py, (planet.r * n) / 2, 0, 2 * Math.PI);
      ctx.fillStyle = "#05070d";
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.stroke();
    }
  }

  root.PandoraStarView = { drawStar };
})(self);
