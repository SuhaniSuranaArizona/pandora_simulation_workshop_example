"""Forward model: a planet transiting a pixelated, spotted, rotating star."""

from dataclasses import dataclass

import numpy as np

from .spectra import StellarSpectra
from .surface import PixelGrid, Star


@dataclass(frozen=True)
class LimbDarkening:
    """Quadratic law ``1 - u1 (1-mu) - u2 (1-mu)^2``; coefficients may depend on wavelength."""

    u1: object = 0.0
    u2: object = 0.0

    def arrays(self, n_wavelengths: int):
        u1 = np.broadcast_to(np.asarray(self.u1, dtype=float), (n_wavelengths,))
        u2 = np.broadcast_to(np.asarray(self.u2, dtype=float), (n_wavelengths,))
        return u1, u2


@dataclass(frozen=True)
class Orbit:
    """Circular orbit. ``a_over_rs`` is the semi-major axis in stellar radii."""

    period_days: float
    a_over_rs: float
    inc_deg: float = 90.0
    t0_days: float = 0.0

    def sky_position(self, t_days: float):
        """Planet (x, y, z) in stellar radii; z > 0 means in front of the star."""
        phase = 2.0 * np.pi * (t_days - self.t0_days) / self.period_days
        inc = np.radians(self.inc_deg)
        a = self.a_over_rs
        return a * np.sin(phase), a * np.cos(inc) * np.cos(phase), a * np.sin(inc) * np.cos(phase)


@dataclass
class TransitSimulation:
    """Result of :func:`simulate_transit`; fluxes are relative to the immaculate star.

    ``flux`` includes the planet and ``star_flux`` does not, so the apparent depth at each
    time is ``1 - flux / star_flux``. ``coverage[t, component, wavelength]`` holds the
    flux-weighted covering fractions, which feed the analytic epsilon.
    """

    times: np.ndarray
    wavelengths: np.ndarray
    flux: np.ndarray
    star_flux: np.ndarray
    coverage: np.ndarray

    @property
    def depth(self) -> np.ndarray:
        return 1.0 - self.flux / self.star_flux


def simulate_transit(
    star: Star,
    spectra: StellarSpectra,
    orbit: Orbit,
    rp_over_rs,
    times,
    limb_darkening: LimbDarkening = LimbDarkening(),
    grid: PixelGrid | None = None,
) -> TransitSimulation:
    """Simulate a transit at every wavelength of ``spectra``.

    ``rp_over_rs`` is a scalar or an array with one radius ratio per wavelength.
    """
    grid = grid or PixelGrid()
    times = np.atleast_1d(np.asarray(times, dtype=float))
    n_wl = spectra.wavelength_um.size
    rp = np.broadcast_to(np.asarray(rp_over_rs, dtype=float), (n_wl,))
    u1, u2 = limb_darkening.arrays(n_wl)
    s = spectra.stack()  # (3, n_wl)

    def weights(m):  # m: (3 components, 3 moments) -> (3, n_wl)
        return m[:, 0, None] - u1 * m[:, 1, None] - u2 * m[:, 2, None]

    immaculate = grid.component_moments(np.zeros((grid.n, grid.n), dtype=np.int8))
    f_immaculate = s[0] * weights(immaculate)[0]

    star_flux = np.empty((times.size, n_wl))
    flux = np.empty_like(star_flux)
    coverage = np.empty((times.size, 3, n_wl))
    for i, t in enumerate(times):
        labels = grid.labels(star.feature_centers(t), star.features)
        w = weights(grid.component_moments(labels))
        star_flux[i] = (s * w).sum(0)
        coverage[i] = w / w.sum(0)
        removed = 0.0
        xp, yp, zp = orbit.sky_position(t)
        if zp > 0.0:
            occ = grid.occulted_moments(labels, xp, yp, rp)  # (n_wl, 3, 3)
            w_occ = occ[..., 0] - u1[:, None] * occ[..., 1] - u2[:, None] * occ[..., 2]
            removed = (s.T * w_occ).sum(1)
        flux[i] = star_flux[i] - removed
    return TransitSimulation(
        times=times,
        wavelengths=spectra.wavelength_um,
        flux=flux / f_immaculate,
        star_flux=star_flux / f_immaculate,
        coverage=coverage,
    )
