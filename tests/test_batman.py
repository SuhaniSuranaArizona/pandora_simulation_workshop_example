"""No-spot transit light curves against batman."""

import batman
import numpy as np
import pytest

from pandora_sim import LimbDarkening, Orbit, PixelGrid, Star, StellarSpectra, simulate_transit

CASES = [
    # rp, a/Rs, inc, (u1, u2)
    (0.05, 10.0, 89.0, (0.4, 0.25)),
    (0.10, 8.0, 87.0, (0.5, 0.20)),
    (0.15, 6.0, 86.0, (0.3, 0.30)),
    (0.10, 8.0, 90.0, (0.0, 0.0)),
]


@pytest.mark.parametrize("rp,a,inc,u", CASES)
def test_matches_batman(rp, a, inc, u):
    period = 3.0
    orbit = Orbit(period, a, inc, t0_days=0.0)
    duration = period / np.pi * np.arcsin(np.sqrt((1 + rp) ** 2 - (a * np.cos(np.radians(inc))) ** 2) / a / np.sin(np.radians(inc)))
    t = np.linspace(-0.7 * duration, 0.7 * duration, 41)
    flat = np.ones(1)
    spectra = StellarSpectra(np.array([1.0]), flat, flat, flat)
    sim = simulate_transit(Star(), spectra, orbit, rp, t, LimbDarkening(*u), PixelGrid(1201))

    p = batman.TransitParams()
    p.t0, p.per, p.rp, p.a, p.inc, p.ecc, p.w = 0.0, period, rp, a, inc, 0.0, 90.0
    p.u, p.limb_dark = list(u), "quadratic"
    reference = batman.TransitModel(p, t).light_curve(p)

    residual = sim.flux[:, 0] - reference
    # Measured ~1e-6 at this resolution; a 1% radius error would give ~2e-4
    assert np.max(np.abs(residual)) < 4e-6, np.max(np.abs(residual))
