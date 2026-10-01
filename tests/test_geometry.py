"""Pixel normalisation and spot geometry against closed forms."""

import numpy as np

from pandora_sim import Feature, LimbDarkening, Orbit, PixelGrid, Star, StellarSpectra, simulate_transit

ONE = np.ones(1)
SPECTRA = StellarSpectra(np.array([1.0]), ONE, 0.5 * ONE, ONE)
FAR = Orbit(3.0, 8.0, 90.0, 0.0)


def test_disk_area_is_pi():
    g = PixelGrid(801)
    assert abs(g.W[0].sum() * g.h**2 - np.pi) < 1e-5


def test_limb_darkened_flux_converges_to_analytic_integral():
    # mu has a square-root singularity at the limb, so the error falls as roughly h^1.4
    # (about 2.5e-5 at n=801), not h^2. It must still shrink steadily with resolution.
    u1, u2 = 0.45, 0.22
    errors = []
    for n in (401, 801, 1601):
        g = PixelGrid(n)
        flux = (g.W[0] - u1 * g.W[1] - u2 * g.W[2]).sum() * g.h**2
        errors.append(abs(flux / (np.pi * (1 - u1 / 3 - u2 / 6)) - 1))
    assert errors[0] < 1e-4 and errors[1] < 3e-5 and errors[2] < 1.2e-5
    assert errors[1] < errors[0] / 2 and errors[2] < errors[1] / 2


def test_face_on_spot_area_fraction():
    # A cap of angular radius alpha centred on the sub-observer point projects to a disc of
    # radius sin(alpha), so it covers a fraction sin(alpha)^2 of the disk (no limb darkening).
    g = PixelGrid(801)
    for alpha in (10.0, 30.0, 60.0, 85.0):
        star = Star([Feature("spot", 0.0, 0.0, alpha)])
        sim = simulate_transit(star, SPECTRA, FAR, 0.05, [-1.5], grid=g)  # planet off disk
        assert abs(sim.coverage[0, 1, 0] - np.sin(np.radians(alpha)) ** 2) < 2e-3, alpha


def test_spot_rotates_out_of_view():
    g = PixelGrid(401)
    # Starts at disk centre at t = -1.5 d (planet behind the star) and is on the far side 5 d later.
    star = Star([Feature("spot", 0.0, 54.0, 15.0)], prot_days=10.0)
    sim = simulate_transit(star, SPECTRA, FAR, 0.05, [-1.5, 3.5], grid=g)
    assert sim.coverage[0, 1, 0] > 0.05 and sim.coverage[1, 1, 0] == 0.0


def test_planet_fully_inside_spot_removes_spot_flux():
    # Large spot centred on the disk; the planet sits wholly inside it at mid-transit, so
    # the depth is rp^2 times the spot-to-total surface brightness ratio (no limb darkening).
    g = PixelGrid(1201)
    rp = 0.05
    star = Star([Feature("spot", 0.0, 0.0, 60.0)])
    sim = simulate_transit(star, SPECTRA, FAR, rp, [0.0], grid=g)
    area_spot = np.sin(np.radians(60.0)) ** 2
    mean_brightness = area_spot * 0.5 + (1 - area_spot) * 1.0
    expected = rp**2 * 0.5 / mean_brightness
    assert abs(sim.depth[0, 0] / expected - 1) < 2e-3
