# Plan: Stellar Contamination and Pandora Simulator Website

As of 2026-09-30

## Goal and scope

The site lets researchers and proposal reviewers see, with adjustable physical parameters, how stellar surface heterogeneity biases a transmission spectrum and how Pandora's joint visible and near-infrared observations recover the true planetary spectrum. It is a static multi-page site that runs research-grade calculations in the browser from precomputed grids.

**In scope:** a spotted and faculae-covered star model, a transit forward model, the transit light source effect (TLSE) on the spectrum, a simulated Pandora observation with noise, and a joint stellar plus planet fit with posteriors. A guided narrative ties the pages together.

**Out of scope for v1:** full 3D stellar surface evolution, pulsation and granulation noise, real Pandora data ingestion, and instrument systematics beyond a simple noise model.

## Site structure

The site has six pages that follow the guided narrative, each with its own interactive module.

| Page | Purpose | Interactive module |
| --- | --- | --- |
| 1. The problem | Explain the transit light source effect | Static-to-animated diagram of a spotted star and transit |
| 2. Star and transit | Build a stellar surface and watch the transit | Spot and faculae editor (size, latitude, temperature), planet radius and impact parameter, live light curve |
| 3. Contamination | Show the biased transmission spectrum against the true one | Wavelength-dependent depth error, toggles for occulted and unocculted cases, stellar type selector |
| 4. Pandora observation | Simulate simultaneous visible photometry and NIR spectroscopy | Noise model, cadence, number of visits, observing-duration controls |
| 5. Correction | Recover the planetary spectrum with a joint fit | Fit settings, posterior plots, before and after spectra |
| 6. Methods and references | Document assumptions, equations, data sources, and limits | Downloadable parameter and result files |

## Physics model

The model follows the standard TLSE formulation: the observed transit depth is the true depth multiplied by a stellar correction factor that depends on the spot and faculae covering fractions and their spectra. For a star with spot covering fraction f_spot and faculae fraction f_fac, the depth correction is:

```latex
\epsilon_\lambda = \left[1 - f_\mathrm{spot}\left(1 - \frac{S_\mathrm{spot,\lambda}}{S_\mathrm{phot,\lambda}}\right) - f_\mathrm{fac}\left(1 - \frac{S_\mathrm{fac,\lambda}}{S_\mathrm{phot,\lambda}}\right)\right]^{-1}
```

The observed depth is then the true depth times epsilon. The plan uses these components:

- **Surface model.** A pixelated stellar disk with limb darkening, spots and faculae placed by latitude and longitude, and rotation so the coverage changes over time. The planet's chord is computed on the same grid to handle occulted spots exactly.
- **Spectra.** Photosphere, spot, and faculae spectra are interpolated from precomputed model grids across effective temperature, surface gravity, and metallicity.
- **Planet.** A transit light curve with wavelength-dependent radius from a simple atmosphere model (for example, water and haze features) so the true signal is known.
- **Consistency check.** The unocculted limit of the pixel model must reproduce the analytic epsilon above.

## Data pipeline

Research-grade spectra cannot be computed in the browser, so a Python build step precomputes everything heavy and ships compact files that the static site loads. No server is needed at run time.

1. **Fetch public model grids.** Use PHOENIX-type stellar atmosphere spectra (for example from the Göttingen spectral library) and confirm the licence and citation requirements.
2. **Trim and resample.** Cut to about 0.4–1.7 µm to cover Pandora's visible and near-infrared bands, then resample to a modest resolution grid.
3. **Tabulate.** Build grids over effective temperature, surface gravity, and metallicity for the stellar types of interest, stored as compressed binary arrays with a small JSON index.
4. **Precompute bandpasses.** Store Pandora's visible and NIR response curves (from mission documentation) so simulated band fluxes are quick to compute.
5. **Ship.** Write the files into the site's static assets, with a version and a build log for reproducibility.

The fit in the browser then needs only interpolation and fast arithmetic, which is realistic with WebAssembly or optimized JavaScript.

## Pandora correction simulation

The site simulates a Pandora-like observation and then recovers the planet's spectrum with a joint fit, showing the result against the known truth. Pandora's exact specifications should be confirmed against mission documentation before these numbers are fixed.

1. **Simulate the truth.** Generate a rotating spotted star, a planet with a known spectrum, and the combined time series in both channels.
2. **Add noise.** Apply photon noise and a configurable instrument noise floor at the chosen cadence, over long (about 24-hour) stares with several visits.
3. **Visible channel.** Use the broadband photometry to constrain spot and faculae coverage as a function of time.
4. **NIR channel.** Extract the transit depth per wavelength bin, which still contains the stellar bias.
5. **Joint fit.** Fit the stellar parameters (coverage fractions, spot and faculae temperatures) and the planetary spectrum together, using MCMC or nested sampling in a web worker, and report posteriors.
6. **Compare.** Plot the uncorrected, corrected, and true spectra, with the recovered uncertainty, and show how results change with spot coverage, stellar type, and number of visits.

The key message the page demonstrates is that simultaneous visible data break the degeneracy between stellar and planetary signals.

## Validation and tech stack

Research reviewers will trust the site only if its numbers match established tools, so validation is part of the build, not an afterthought.

**Validation checks:**

- Transit light curves match an established package (for example batman) for the no-spot case.
- The pixel model's unocculted limit matches the analytic epsilon.
- Stellar spectra match the source grid at the grid nodes.
- The joint fit recovers injected parameters with correct coverage of the credible intervals, tested over many simulated datasets.

**Tech stack:**

| Layer | Choice | Reason |
| --- | --- | --- |
| Build pipeline | Python (numpy, scipy, astropy) | Prepares and validates spectral grids offline |
| Front end | Plain HTML and JavaScript or a light framework | Static hosting, no server |
| Compute | JavaScript with WebAssembly and web workers | Keeps heavy fits off the main thread |
| Plots | D3 or Plotly | Interactive spectra, light curves, posteriors |
| Hosting | Any static host (GitHub Pages, Netlify, or a university server) | Multi-page static site, as chosen |

## Milestones and risks

The build runs in five phases, with the physics core first so every later page rests on validated numbers.

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 1. Physics core | Python reference model and spectral grids | Matches batman and analytic epsilon |
| 2. Browser port | JavaScript forward model and star and transit page | Light curves agree with the Python reference |
| 3. Contamination page | Biased versus true spectrum, stellar type selector | Reproduces reference spectra |
| 4. Pandora and fit | Simulated observation and joint fit in a web worker | Injection-recovery tests pass |
| 5. Narrative and polish | Guided tour, methods page, downloads, accessibility | Reviewed by a domain expert |

**Main risks:**

- **Fit speed in the browser.** Mitigation: coarse grids, WebAssembly, and precomputed posterior libraries as a fallback.
- **Model licences and size.** Mitigation: confirm licences early and keep grids compact.
- **Pandora specifications.** Mitigation: verify against mission documentation and mark unconfirmed values in the UI.
- **Overclaiming realism.** Mitigation: state model limits on the methods page, since reviewers will probe them.

**Open questions:** Which stellar types and planets should be the default examples? Should results be reproducible through shareable URLs? Who will review the physics before release?
