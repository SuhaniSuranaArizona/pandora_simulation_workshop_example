# pandora_simulation

Static website that shows how stellar surface heterogeneity (spots and faculae) biases transmission spectra, and how Pandora's joint visible and near-infrared observations recover the true planetary spectrum.

Conceptual, illustrative explainer, not a research-grade tool. See [plan.md](plan.md) for scope, pages and milestones. The earlier proposal-level plan is kept in [docs/plan_proposal_level.md](docs/plan_proposal_level.md).

## Status

| Phase | State |
| --- | --- |
| 1. Reference model | Done. Validated against batman and the analytic epsilon. Real PHOENIX grids dropped from scope. |
| 2. Star and transit in the browser | Done: pages 1 and 2, JavaScript checked against the Python reference |
| 3. Pandora's trick | Done: page 3, a visible-anchored correction with an explicit, calibrated assumption |
| 4. Polish | Done except a cold read by a colleague: page 4, walk-through, projector view, accessibility and contrast checks |

Validation evidence: [validation/phase1_report.md](validation/phase1_report.md).

## Open the site

Open `site/index.html` in a browser. Page 4 has a suggested 8-minute walk-through for a group meeting, and the header's Projector view button enlarges text and charts. It is plain files with no server, build step or network access.

## Publishing

The site is plain static files, so any static host works. This repository includes a GitHub Pages workflow ([.github/workflows/pages.yml](.github/workflows/pages.yml)) that publishes `site/` on every push to `main`. One-time setup on GitHub: Settings, Pages, Source: GitHub Actions. The page then lives at `https://<account>.github.io/<repository>/`.

## Layout

- `site/` the explainer: `index.html`, `star.html`, `pandora.html`, `about.html` (pages 1 to 4), `js/model.js` (browser port of the reference model), `js/correction.js` and `js/scenario.js` (page 3 method and simulated visits), `js/calibration.js` (generated), `js/presets.js`, `js/plots.js`, `js/starview.js`, `js/chrome.js` (projector view), `css/style.css`.

- `src/pandora_sim/` reference model: `surface.py` (pixel disk, limb darkening, spots, faculae, rotation), `transit.py` (forward model), `tlse.py` (analytic epsilon), `spectra.py` (component spectra, gridded library, flux-conserving resampling), `planet.py` (illustrative planet spectrum), `bandpass.py` (placeholder Pandora bands).
- `pipeline/build_grids.py` builds the compact spectral grid the site will load.
- `tests/` pytest suite, including the batman and analytic-epsilon checks.
- `scripts/run_validation.py` regenerates the validation report.
- `scripts/calibrate_kappa.py` regenerates `site/js/calibration.js`, the κ calibration behind page 3.
- `scripts/make_reference_cases.py` saves Python output to `tests/reference/cases.json`; `tests/js/check_reference.mjs` checks the JavaScript against it (also run by pytest when Node is installed). `tests/js/check_correction.mjs` checks the page 3 fit, the JavaScript-versus-Python κ agreement, and the success and failure layouts. `tests/js/check_site.mjs` checks page structure, labels, links, that nothing loads from the network, and WCAG colour contrast in both themes.

## Usage

```bash
pip install -e ".[dev]"
pytest
PYTHONPATH=src python scripts/run_validation.py
```

Offline placeholder grid (blackbody, flagged `"realistic": false` in its index):

```bash
PYTHONPATH=src:. python -m pipeline.build_grids --synthetic --out data/grids/placeholder
```

Real PHOENIX grid. Nothing is downloaded unless `--download` is given; confirm the library's licence and citation terms first:

```bash
PYTHONPATH=src:. python -m pipeline.build_grids --download
```

## Known limits

- Spot and faculae spectra are a single temperature per class; faculae have no limb-dependent contrast.
- The limb-darkened flux error on the pixel grid falls as roughly h^1.4, about 2.5e-5 relative at 801 pixels.
- Pandora band edges are the published ones (visible 0.4 to 0.7 um, near-infrared 0.9 to 1.6 um, Rotman et al. 2026), but the Python bands are top hats because the response curves were not available.
- The K and M presets give nearly the same fractional depth error for the same spots, because their spot-to-star contrast is similar. That is a property of the chosen temperatures, not a general result.
- The page 3 correction depends on an assumed spot-layout factor κ. A rotation light curve cannot reveal the star's average dimming by itself, so layouts unlike the calibration sample (clustered or evenly spread spots) are over- or under-corrected. Faculae, spot evolution and an unknown spot temperature are not modelled there.
