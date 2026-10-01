"""Pixelated stellar disk with limb darkening, rotating spots and faculae.

Sky frame: x to the right, y up, z toward the observer. Lengths are in stellar radii.
A feature sits at a stellar latitude and longitude, is a circular cap of given angular
radius, and moves with rotation. Where features overlap, the later one in the list wins.

Every pixel contributes ``S_component(lambda) * (1 - u1 (1-mu) - u2 (1-mu)^2)``, so the
geometry reduces to three moments per component, ``sum w (1-mu)^k`` for k = 0, 1, 2.
Wavelength dependence then only enters through cheap linear combinations of those
moments, and the planet's chord is integrated exactly on the same grid.
"""

from dataclasses import dataclass
from typing import Sequence

import numpy as np

PHOT, SPOT, FAC = 0, 1, 2
_KINDS = {"spot": SPOT, "faculae": FAC}


@dataclass(frozen=True)
class Feature:
    """A circular spot or facular region."""

    kind: str
    lat_deg: float
    lon_deg: float
    radius_deg: float

    def __post_init__(self):
        if self.kind not in _KINDS:
            raise ValueError(f"kind must be one of {sorted(_KINDS)}, got {self.kind!r}")
        if not 0.0 < self.radius_deg <= 90.0:
            raise ValueError("radius_deg must be in (0, 90]")


@dataclass(frozen=True)
class Star:
    """Geometry and rotation of the stellar surface features."""

    features: Sequence[Feature] = ()
    inclination_deg: float = 90.0
    obliquity_deg: float = 0.0
    prot_days: float = np.inf

    def feature_centers(self, t_days: float) -> np.ndarray:
        """Unit vectors of the feature centres in the sky frame, shape (n_features, 3)."""
        theta = np.radians(90.0 - self.inclination_deg)
        psi = np.radians(self.obliquity_deg)
        out = np.empty((len(self.features), 3))
        for k, f in enumerate(self.features):
            lat = np.radians(f.lat_deg)
            lon = np.radians(f.lon_deg + 360.0 * t_days / self.prot_days)
            x, y, z = np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)
            y1 = y * np.cos(theta) - z * np.sin(theta)
            z1 = y * np.sin(theta) + z * np.cos(theta)
            out[k] = (x * np.cos(psi) - y1 * np.sin(psi), x * np.sin(psi) + y1 * np.cos(psi), z1)
        return out


class PixelGrid:
    """Square pixel grid over [-1, 1]^2 with anti-aliased stellar and planetary edges."""

    def __init__(self, n: int = 601):
        self.n = n
        self.h = h = 2.0 / n
        c = (np.arange(n) + 0.5) * h - 1.0
        self.x, self.y = np.meshgrid(c, c, indexing="xy")  # arrays indexed [row=y, col=x]
        rho = np.hypot(self.x, self.y)
        width = np.maximum(h * (np.abs(self.x) + np.abs(self.y)) / np.maximum(rho, 1e-12), 1e-12)
        area = np.clip(0.5 + (1.0 - rho) / width, 0.0, 1.0)
        mu = np.sqrt(np.clip(1.0 - rho**2, 0.0, 1.0))
        scale = np.where(rho > 1.0, 1.0 / np.maximum(rho, 1e-12), 1.0)
        self.nx, self.ny, self.nz = self.x * scale, self.y * scale, mu
        one_minus_mu = 1.0 - mu
        self.W = np.stack([area, area * one_minus_mu, area * one_minus_mu**2])  # (3, n, n)

    def labels(self, centers: np.ndarray, features: Sequence[Feature]) -> np.ndarray:
        """Component label (PHOT, SPOT or FAC) of every pixel."""
        lab = np.zeros((self.n, self.n), dtype=np.int8)
        for centre, f in zip(centers, features):
            inside = self.nx * centre[0] + self.ny * centre[1] + self.nz * centre[2] > np.cos(
                np.radians(f.radius_deg)
            )
            lab[inside] = _KINDS[f.kind]
        return lab

    def component_moments(self, labels: np.ndarray) -> np.ndarray:
        """Disk moments ``sum w (1-mu)^k`` per component, shape (3 components, 3 moments)."""
        out = np.empty((3, 3))
        flat = labels.ravel()
        for k in range(3):
            out[:, k] = np.bincount(flat, weights=self.W[k].ravel(), minlength=3)
        return out * self.h**2

    def occulted_moments(self, labels: np.ndarray, xp: float, yp: float, rp) -> np.ndarray:
        """Moments of the pixels covered by the planet, shape (n_radii, 3, 3).

        ``rp`` holds one planet radius per wavelength. Only the planet's bounding box is
        visited, so the cost scales with the planet's size, not the grid size.
        """
        rp = np.atleast_1d(np.asarray(rp, dtype=float))
        h, n = self.h, self.n
        rmax = rp.max()
        x0 = max(int(np.floor((xp - rmax + 1.0) / h)) - 1, 0)
        x1 = min(int(np.ceil((xp + rmax + 1.0) / h)) + 1, n)
        y0 = max(int(np.floor((yp - rmax + 1.0) / h)) - 1, 0)
        y1 = min(int(np.ceil((yp + rmax + 1.0) / h)) + 1, n)
        if x0 >= x1 or y0 >= y1:
            return np.zeros((rp.size, 3, 3))
        sl = (slice(y0, y1), slice(x0, x1))
        dx, dy = self.x[sl] - xp, self.y[sl] - yp
        d = np.hypot(dx, dy).ravel()
        width = np.maximum(h * (np.abs(dx) + np.abs(dy)).ravel() / np.maximum(d, 1e-12), 1e-12)
        cover = np.clip(0.5 + (rp[:, None] - d[None, :]) / width[None, :], 0.0, 1.0)
        lab = labels[sl].ravel()
        basis = np.empty((d.size, 9))
        for k in range(3):
            wk = self.W[k][sl].ravel()
            for c in range(3):
                basis[:, 3 * c + k] = wk * (lab == c)
        return (cover @ basis).reshape(rp.size, 3, 3) * h**2
