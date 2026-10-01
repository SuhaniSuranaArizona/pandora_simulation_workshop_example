"""Instrument bandpasses.

The shipped Pandora bands use the channel edges published in Rotman et al. 2026
(arXiv:2603.04488): visible photometry 0.4-0.7 um and near-infrared spectroscopy 0.9-1.6 um.
Their shapes are top hats, because the response curves were not available, so they stay
``confirmed=False``. Replace them with the mission response curves (``Bandpass.from_csv``)
before any throughput-weighted number from them is quoted.
"""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Bandpass:
    name: str
    wavelength_um: np.ndarray
    response: np.ndarray
    confirmed: bool
    source: str

    @classmethod
    def top_hat(cls, name, lo_um, hi_um, n=200):
        wl = np.linspace(lo_um, hi_um, n)
        return cls(name, wl, np.ones(n), False, "top hat between published band edges; response shape not from mission data")

    @classmethod
    def from_csv(cls, path, name, source):
        """Two columns: wavelength (um) and response. Lines starting with # are skipped."""
        wl, resp = np.loadtxt(path, delimiter=",", unpack=True)
        return cls(name, wl, resp, True, source)

    def average(self, wavelength_um, flux) -> float:
        """Response-weighted mean of ``flux`` (given on ``wavelength_um``) over the band."""
        r = np.interp(wavelength_um, self.wavelength_um, self.response, left=0.0, right=0.0)
        return float(np.trapz(flux * r, wavelength_um) / np.trapz(r, wavelength_um))


# Edges from Rotman et al. 2026 (arXiv:2603.04488).
PANDORA_VISIBLE = Bandpass.top_hat("pandora_visible", 0.4, 0.7)
PANDORA_NIR = Bandpass.top_hat("pandora_nir", 0.9, 1.6)
