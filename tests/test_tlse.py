"""The pixel model's unocculted limit reproduces the analytic epsilon."""

import numpy as np

from pandora_sim import Feature, LimbDarkening, Orbit, Star, epsilon, simulate_transit

ORBIT = Orbit(3.0, 8.0, 90.0, 0.0)
RP = 0.08
# Spots and faculae kept at high |latitude| so the equatorial chord stays clean.
STAR = Star(
    [
        Feature("spot", 55.0, 10.0, 15.0),
        Feature("spot", 50.0, 200.0, 10.0),
        Feature("faculae", -50.0, 120.0, 14.0),
        Feature("faculae", 60.0, 300.0, 8.0),
    ],
    inclination_deg=90.0,
    prot_days=11.0,
)
LD = LimbDarkening(u1=np.linspace(0.6, 0.2, 7), u2=np.linspace(0.25, 0.1, 7))  # chromatic


def test_out_of_transit_flux_is_one_over_epsilon(grid, spectra):
    t = np.array([-1.0, -0.4, 0.9, 1.3])  # planet off the disk or behind the star
    sim = simulate_transit(STAR, spectra, ORBIT, RP, t, LD, grid)
    f_spot, f_fac = sim.coverage[:, 1], sim.coverage[:, 2]
    eps = epsilon(f_spot, f_fac, spectra.spot, spectra.fac, spectra.phot)
    np.testing.assert_allclose(1.0 / sim.star_flux, eps, rtol=1e-12)
    assert np.all(sim.coverage[:, 1:].sum(1) > 0.01)  # the test actually has spots in view


def test_unocculted_transit_depth_is_true_depth_times_epsilon(grid, spectra):
    t0 = np.array([0.0])
    spotted = simulate_transit(STAR, spectra, ORBIT, RP, t0, LD, grid)
    clean = simulate_transit(Star(), spectra, ORBIT, RP, t0, LD, grid)
    eps = epsilon(
        spotted.coverage[:, 1], spotted.coverage[:, 2], spectra.spot, spectra.fac, spectra.phot
    )
    np.testing.assert_allclose(spotted.depth, clean.depth * eps, rtol=1e-10)
    assert np.all(eps > 1.0 + 1e-3)


def test_occulted_spot_breaks_the_unocculted_relation(grid, spectra):
    star = Star([Feature("spot", 0.0, 0.0, 20.0)])  # sits on the chord at mid-transit
    t0 = np.array([0.0])
    spotted = simulate_transit(star, spectra, ORBIT, RP, t0, LD, grid)
    clean = simulate_transit(Star(), spectra, ORBIT, RP, t0, LD, grid)
    eps = epsilon(spotted.coverage[:, 1], spotted.coverage[:, 2], spectra.spot, spectra.fac, spectra.phot)
    # The planet blocks cooler, dimmer spot surface, so the depth is lower than eps * true.
    assert np.all(spotted.depth < clean.depth * eps * 0.95)
