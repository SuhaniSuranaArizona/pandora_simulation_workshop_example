# Plan: Stellar Contamination and Pandora, a Conceptual Explainer

As of 2026-09-30. This replaces the proposal-level plan, which is kept in [docs/plan_proposal_level.md](docs/plan_proposal_level.md).

## Goal and scope

A small static site that builds intuition for one idea: starspots and faculae change the apparent transit depth differently at different wavelengths, and observing the star in visible light at the same time as the infrared helps separate the star's signal from the planet's.

The site is illustrative. It uses simplified physics, says so on every page, and makes no claim to match real Pandora performance or published spectra.

**In scope:** a simple spotted star, a transit you can watch, the resulting bias in the transmission spectrum, and a simplified picture of how simultaneous visible data let you correct it.

**Out of scope:** research-grade stellar model grids, validation against published results, real Pandora specifications or data, full Bayesian fitting, instrument systematics, and expert review before release.

## Audience and tone

A quick group meeting: colleagues who know what a transit is but may not have met the transit light source effect (TLSE). The site is walked through live in about five to ten minutes, so the pages run in a single story order and every control has a sensible default. Plain language first, equations one click deeper.

## Site structure

Four pages, each with one idea and one interactive.

| Page | Idea | Interactive |
| --- | --- | --- |
| 1. The problem | A spotted star fools a transit measurement | Animated star and transit with a live light curve |
| 2. Play with the star | Spots change the spectrum, not just the brightness | Spot and faculae size, latitude and count, star temperature, planet size; shows biased versus true depth across wavelength, with a toggle for spots in or out of the planet's path |
| 3. Pandora's trick | Visible data reveal the star, infrared carries the planet | Visible and infrared light curves side by side, a noise slider, a "correct it" button that shows before, after and true spectra |
| 4. About this model | What is simplified and why | Assumptions, the main equation, references |

## Physics model (simplified)

- **Correction factor.** The observed depth is the true depth times ε, where

```latex
\epsilon_\lambda = \left[1 - f_\mathrm{spot}\left(1 - \frac{S_\mathrm{spot,\lambda}}{S_\mathrm{phot,\lambda}}\right) - f_\mathrm{fac}\left(1 - \frac{S_\mathrm{fac,\lambda}}{S_\mathrm{phot,\lambda}}\right)\right]^{-1}
```

- **Spectra.** Blackbodies at the photosphere, spot and faculae temperatures. This is enough to show the right trend (contrast is larger in the visible than the infrared) without a stellar atmosphere library.
- **Star presets.** Two, both illustrative round numbers and not fits to any real star:

| Preset | Photosphere | Spots | Faculae | Notes |
| --- | --- | --- | --- | --- |
| M dwarf (default) | 3500 K | 3100 K | 3600 K | Small star, so a sub-Neptune-sized planet gives a deep transit |
| K dwarf | 4500 K | 3900 K | 4600 K | For comparison. With these temperatures the fractional depth error is nearly the same as for the M dwarf at the same spot coverage (about 4.0 % against 3.9 % at 0.6 micron), because the spot-to-star contrast is similar |

- **Default planet.** One made-up sub-Neptune-sized planet with Rp/Rs = 0.06, a flat baseline and two or three water-like bands, in a short period orbit so the transit is quick to animate.
- **Surface.** A pixelated disk with limb darkening and rotating circular spots, as in the Phase 1 reference model. The page 2 live view may use a coarser grid.
- **Planet.** A made-up radius-versus-wavelength curve with a couple of water-like bands, so the true answer is known.
- **Correction (page 3).** Not a full sampler. A sinusoid fitted to the visible light curve gives the rotation modulation, which is scaled by a factor κ to estimate the star's average dimming at the transit, then by the known spot and star temperatures to each infrared wavelength. Dividing each transit by its ε gives the corrected spectrum. κ is the one assumption: a rotation light curve shows only how the brightness changes, not how spotted the star is on average, so κ was calibrated over 1000 random spot layouts (median 0.99, 16 to 84 per cent range 0.69 to 1.91). The page shows that range as a band. Layouts unlike the calibration sample break it: clustered spots (κ about 0.63) are overcorrected, and evenly spread spots (κ about 9) are barely corrected. The page demonstrates both and says so plainly.

## Build approach

- **Reuse Phase 1.** `src/pandora_sim` already implements the surface, the transit, ε and the blackbody spectra. It becomes the reference implementation for the site, and the place to generate any precomputed example curves.
- **Front end.** Plain HTML and JavaScript with a small plotting library. JavaScript reimplements the simple disk model and ε; nothing needs a server, WebAssembly or web workers.
- **No data pipeline.** Blackbodies need no downloaded grids, so no licences to clear and no large files.
- **Delivery.** A local page opened from the folder, with nothing fetched from the network. Hosting is out of scope for now.

## Checks (light)

- The pixel model's unocculted limit matches the analytic ε. Done in Phase 1.
- The no-spot light curve matches batman. Done in Phase 1.
- The JavaScript port matches the Python reference on a few saved example cases.
- Every page carries an "illustrative model" note, and Pandora numbers are labelled approximate.

## Milestones

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 1. Reference model | Python model, tests, validation report | **Done.** Matches batman and analytic ε. The real-spectra part of the old Phase 1 is dropped. |
| 2. Star and transit in the browser | Pages 1 and 2 | **Done.** JavaScript matches the Python reference on four saved cases to about 1e-16 |
| 3. Pandora's trick | Page 3 and the simplified correction | **Done.** Before, after and true spectra are plotted with a range that reflects the κ assumption. Node tests check the fit, the calibration against Python, and the success and failure layouts |
| 4. Polish | Page 4, wording, a five-to-ten-minute walk-through order, readable on a projector | **Done, except the cold read.** Page 4, the walk-through, projector view, accessibility checks and verified Pandora bands are in. A colleague reading it cold still needs a person |

## Risks

- **Blackbodies look unrealistic to specialists.** Mitigation: label them as a teaching simplification on page 4.
- **The simplified correction overstates how well the method works.** Mitigation: the page shows a range that comes from the assumption, and two layouts where the method fails. Noise is not the main limit here; the layout assumption is.
- **Scope creep back toward research-grade.** Mitigation: anything that needs a stellar grid, a sampler or validation against real data is deferred.

## Decisions made

- **Audience:** a quick group meeting, walked through live.
- **Default star:** M dwarf, with a K dwarf preset for comparison (see the table above).
- **Default planet:** the made-up Rp/Rs = 0.06 sub-Neptune described above.
- **Pandora bands:** drawn as shaded regions on the spectra at the published edges, 0.4 to 0.7 micron (visible photometry) and 0.9 to 1.6 micron (near-infrared spectroscopy), from Rotman et al. 2026 (arXiv:2603.04488). The same paper gives 24-hour visits, about 20 targets and at least ten transits each, which page 3 follows. Earlier working values of 0.4 to 0.9 and 0.8 to 1.6 micron were wrong and have been replaced.

- **Delivery:** a local page is enough. The site opens straight from the project folder, so it uses no server, no build step and no network at run time. That means plain files, with any plotting library vendored locally rather than loaded from a CDN. Static hosting can be added later if it is ever wanted.

## Open questions

None at the moment.
