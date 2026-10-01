/* Minimal canvas line charts: axes, ticks, lines, shaded bars and a legend. No dependencies. */
(function (root) {
  "use strict";

  function niceTicks(lo, hi, target) {
    const raw = (hi - lo) / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
    return { ticks, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
  }

  // toFixed can give "-0.0"; show plain zero instead.
  const fmt = (v, d) => { const t = v.toFixed(d); return +t === 0 ? (0).toFixed(d) : t; };
  const themeColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  class Chart {
    /** opts.aspect: height / width. */
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.aspect = opts.aspect || 0.55;
      this.last = null;
      new ResizeObserver(() => this.last && this.draw(this.last)).observe(canvas);
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.last && this.draw(this.last));
      window.addEventListener("pandora:redraw", () => this.last && this.draw(this.last)); // e.g. projector view
    }

    /**
     * spec: {xlim, ylim, xlabel, ylabel, series:[{x,y,color,width,dash,label}],
     *        areas:[{x,lo,hi,color,alpha}] (shaded bands), errors:[{x,y,err,color}], points:[{x,y,color,r,alpha}],
     *        bars:[{x0,x1,color,label}] (strips under the x axis), vlines:[{x,color,dash}], legend:[{color,dash,label}]}
     */
    draw(spec) {
      this.last = spec;
      const cv = this.canvas, dpr = window.devicePixelRatio || 1, font = themeColor("--font");
      const k = parseFloat(themeColor("--chart-scale")) || 1; // 1 normally, larger in projector view
      const px = (n) => n * k + "px ";
      const w = cv.clientWidth;
      if (!w) return;
      const ink = themeColor("--ink"), muted = themeColor("--muted"), grid = themeColor("--grid");
      const barRows = spec.bars ? spec.bars.length : 0;
      // Lay the legend out first (on a scratch canvas, since resizing the real one resets its state):
      // it wraps onto more rows when the chart is narrow.
      const scratch = document.createElement("canvas").getContext("2d");
      scratch.font = px(13) + font;
      const legend = spec.legend || [], legendPos = [], left = 64 * k;
      let row = 0, lx = left;
      for (const item of legend) {
        const itemW = 30 * k + scratch.measureText(item.label).width;
        if (lx > left && lx + itemW > w - 14) { row++; lx = left; }
        legendPos.push([lx, row]);
        lx += itemW + 20 * k;
      }
      const m = { l: left, r: 14, t: legend.length ? (14 + (row + 1) * 22) * k : 12, b: (50 + barRows * 17) * k };
      const h = Math.max(Math.round(w * this.aspect), m.t + m.b + 170); // never squash the plot area
      cv.style.height = h + "px";
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = px(13) + font;
      const [x0, x1] = spec.xlim, [y0, y1] = spec.ylim;
      const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (w - m.l - m.r);
      const Y = (v) => h - m.b - ((v - y0) / (y1 - y0)) * (h - m.t - m.b);
      ctx.textBaseline = "middle";

      const xt = niceTicks(x0, x1, 6), yt = niceTicks(y0, y1, 5);
      ctx.lineWidth = 1; ctx.strokeStyle = grid; ctx.fillStyle = muted;
      ctx.textAlign = "right";
      for (const v of yt.ticks) {
        ctx.beginPath(); ctx.moveTo(m.l, Y(v) + 0.5); ctx.lineTo(w - m.r, Y(v) + 0.5); ctx.stroke();
        ctx.fillText(fmt(v, yt.decimals), m.l - 8 * k, Y(v));
      }
      ctx.textAlign = "center";
      for (const v of xt.ticks) ctx.fillText(fmt(v, xt.decimals), X(v), h - m.b + 14 * k);

      ctx.save();
      ctx.beginPath(); ctx.rect(m.l, m.t, w - m.l - m.r, h - m.t - m.b); ctx.clip();
      for (const vl of spec.vlines || []) {
        ctx.strokeStyle = vl.color || muted; ctx.setLineDash(vl.dash || []); ctx.lineWidth = 1.5 * Math.min(k, 1.4);
        ctx.beginPath(); ctx.moveTo(X(vl.x), m.t); ctx.lineTo(X(vl.x), h - m.b); ctx.stroke();
      }
      for (const a of spec.areas || []) {
        ctx.fillStyle = a.color; ctx.globalAlpha = a.alpha || 0.22;
        ctx.beginPath();
        a.x.forEach((xv, i) => (i ? ctx.lineTo(X(xv), Y(a.hi[i])) : ctx.moveTo(X(xv), Y(a.hi[i]))));
        for (let i = a.x.length - 1; i >= 0; i--) ctx.lineTo(X(a.x[i]), Y(a.lo[i]));
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      for (const e of spec.errors || []) {
        ctx.strokeStyle = e.color; ctx.lineWidth = 1.3 * Math.min(k, 1.4); ctx.globalAlpha = 0.8;
        e.x.forEach((xv, i) => {
          ctx.beginPath(); ctx.moveTo(X(xv), Y(e.y[i] - e.err[i])); ctx.lineTo(X(xv), Y(e.y[i] + e.err[i])); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }
      for (const s of spec.series) {
        ctx.strokeStyle = s.color; ctx.lineWidth = (s.width || 2.5) * Math.min(k, 1.4); ctx.setLineDash(s.dash || []);
        ctx.lineJoin = "round"; ctx.beginPath();
        s.x.forEach((xv, i) => (i ? ctx.lineTo(X(xv), Y(s.y[i])) : ctx.moveTo(X(xv), Y(s.y[i]))));
        ctx.stroke();
      }
      for (const pt of spec.points || []) {
        ctx.fillStyle = pt.color; ctx.globalAlpha = pt.alpha || 1;
        pt.x.forEach((xv, i) => { ctx.beginPath(); ctx.arc(X(xv), Y(pt.y[i]), (pt.r || 3) * Math.min(k, 1.4), 0, 2 * Math.PI); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.setLineDash([]);

      ctx.strokeStyle = muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.l + 0.5, m.t); ctx.lineTo(m.l + 0.5, h - m.b + 0.5); ctx.lineTo(w - m.r, h - m.b + 0.5); ctx.stroke();

      (spec.bars || []).forEach((b, row) => {
        const top = h - m.b + (46 + row * 17) * k, xa = X(Math.max(b.x0, x0)), xb = X(Math.min(b.x1, x1)), bh = 13 * k;
        ctx.fillStyle = b.color;
        ctx.fillRect(xa, top, xb - xa, bh);
        ctx.fillStyle = "#fff"; ctx.textAlign = "left";
        ctx.font = px(12) + font;
        const label = b.short && ctx.measureText(b.label).width > xb - xa - 12 ? b.short : b.label;
        ctx.fillText(label, xa + 6, top + bh / 2 + 0.5);
        ctx.font = px(13) + font;
      });

      ctx.fillStyle = ink; ctx.textAlign = "center";
      ctx.fillText(spec.xlabel, m.l + (w - m.l - m.r) / 2, h - m.b + 34 * k);
      ctx.save();
      ctx.translate(15 * k, m.t + (h - m.t - m.b) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(spec.ylabel, 0, 0);
      ctx.restore();

      ctx.textAlign = "left";
      legend.forEach((item, i) => {
        const [x, r] = legendPos[i], y = (15 + r * 22) * k;
        ctx.strokeStyle = item.color; ctx.lineWidth = 2.5 * Math.min(k, 1.4); ctx.setLineDash(item.dash || []);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24 * k, y); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = ink;
        ctx.fillText(item.label, x + 30 * k, y);
      });
    }
  }

  root.PandoraPlots = { Chart };
})(self);
