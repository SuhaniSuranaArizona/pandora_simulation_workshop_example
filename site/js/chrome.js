/* Shared page chrome: the projector-view toggle. */
(function () {
  "use strict";
  const btn = document.getElementById("proj");
  if (!btn) return;
  const root = document.documentElement;
  function apply(on) {
    root.classList.toggle("projector", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Normal view" : "Projector view";
    window.dispatchEvent(new Event("pandora:redraw"));
  }
  btn.addEventListener("click", () => {
    const on = !root.classList.contains("projector");
    apply(on);
    try { localStorage.setItem("pandoraProjector", on ? "1" : "0"); } catch (e) { /* storage can be blocked */ }
  });
  let saved = false;
  try { saved = localStorage.getItem("pandoraProjector") === "1"; } catch (e) { /* ignore */ }
  if (saved) apply(true);
})();
