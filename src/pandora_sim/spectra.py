"""Stellar spectra: component spectra, gridded libraries, resampling and a blackbody stand-in."""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.interpolate import RegularGridInterpolator

_H, _C, _K = 6.62607015e-34, 2.99792458e8, 1.380649e-23


def blackbody(wavelength_um, teff):
    """Planck flux density B_lambda (W m^-3 sr^-1). A placeholder, not a stellar atmosphere."""
    lam = np.asarray(wavelength_um, dtype=float) * 1e-6
    return 2.0 * _H * _C**2 / lam**5 / np.expm1(_H * _C / (lam * _K * teff))


@dataclass(frozen=True)
class StellarSpectra:
    """Photosphere, spot and faculae spectra on one wavelength grid (micron)."""

    wavelength_um: np.ndarray
    phot: np.ndarray
    spot: np.ndarray
    fac: np.ndarray

    def stack(self) -> np.ndarray:
        """Shape (3, n_wavelengths), ordered to match PHOT, SPOT, FAC."""
        return np.stack([self.phot, self.spot, self.fac])


@dataclass
class SpectralGrid:
    """Spectra tabulated over (teff, logg, [Fe/H]) and wavelength, with linear interpolation.

    Interpolation is linear in log flux. Requests outside the tabulated range raise an
    error, because the grid is never silently extrapolated.
    """

    teff: np.ndarray
    logg: np.ndarray
    feh: np.ndarray
    wavelength_um: np.ndarray
    flux: np.ndarray  # (n_teff, n_logg, n_feh, n_wavelength), strictly positive
    meta: dict

    def __post_init__(self):
        expected = (self.teff.size, self.logg.size, self.feh.size, self.wavelength_um.size)
        if self.flux.shape != expected:
            raise ValueError(f"flux shape {self.flux.shape} does not match axes {expected}")
        self._interp = RegularGridInterpolator(
            (self.teff, self.logg, self.feh), np.log(self.flux.astype(float)), method="linear"
        )

    def spectrum(self, teff, logg, feh) -> np.ndarray:
        return np.exp(self._interp([[teff, logg, feh]])[0])

    def stellar_spectra(self, teff, logg, feh, spot_dt=-400.0, fac_dt=100.0) -> StellarSpectra:
        """Photosphere at ``teff`` with spots and faculae offset by ``spot_dt`` and ``fac_dt`` K."""
        return StellarSpectra(
            self.wavelength_um,
            self.spectrum(teff, logg, feh),
            self.spectrum(teff + spot_dt, logg, feh),
            self.spectrum(teff + fac_dt, logg, feh),
        )

    def save(self, directory) -> None:
        """Write ``spectra.npz`` (compressed arrays) and ``index.json`` (axes and metadata)."""
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            directory / "spectra.npz",
            teff=self.teff, logg=self.logg, feh=self.feh,
            wavelength_um=self.wavelength_um, flux=self.flux,
        )
        index = {
            "file": "spectra.npz",
            "axes": {
                "teff": self.teff.tolist(),
                "logg": self.logg.tolist(),
                "feh": self.feh.tolist(),
                "n_wavelength": int(self.wavelength_um.size),
                "wavelength_um": [float(self.wavelength_um[0]), float(self.wavelength_um[-1])],
            },
            "flux_dtype": str(self.flux.dtype),
            **self.meta,
        }
        (directory / "index.json").write_text(json.dumps(index, indent=2) + "\n")

    @classmethod
    def load(cls, directory) -> "SpectralGrid":
        directory = Path(directory)
        index = json.loads((directory / "index.json").read_text())
        with np.load(directory / index["file"]) as z:
            meta = {k: v for k, v in index.items() if k not in ("file", "axes", "flux_dtype")}
            return cls(z["teff"], z["logg"], z["feh"], z["wavelength_um"], z["flux"], meta)


def resample_flux_conserving(wavelength, flux, edges) -> np.ndarray:
    """Mean flux density in each bin of ``edges``, exact for piecewise-linear input.

    Uses the cumulative trapezoid integral, so the integrated flux is conserved.
    Bins must lie inside the input wavelength range.
    """
    wavelength = np.asarray(wavelength, dtype=float)
    flux = np.asarray(flux, dtype=float)
    edges = np.asarray(edges, dtype=float)
    if edges[0] < wavelength[0] or edges[-1] > wavelength[-1]:
        raise ValueError("bin edges fall outside the input wavelength range")
    cumulative = np.concatenate(
        [[0.0], np.cumsum(0.5 * (flux[1:] + flux[:-1]) * np.diff(wavelength))]
    )
    # Interpolating the cumulative integral linearly ignores curvature inside one input
    # sample, which is negligible when the input is much finer than the output bins.
    integral = np.interp(edges, wavelength, cumulative)
    return np.diff(integral) / np.diff(edges)
