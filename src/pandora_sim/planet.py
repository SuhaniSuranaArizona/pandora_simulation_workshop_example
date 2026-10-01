"""Illustrative planet model with a known wavelength-dependent radius.

The water bands and haze slope are a stand-in for a real atmosphere model; they exist so
the true transmission spectrum is known exactly when testing the correction.
"""

import numpy as np

# (centre in um, width in um) of the broad water bands inside 0.4-1.7 um
_WATER_BANDS = ((0.72, 0.015), (0.82, 0.02), (0.94, 0.03), (1.13, 0.04), (1.40, 0.06))


def water_haze_radius_ratio(wavelength_um, rp0=0.1, water_amp=0.02, haze_amp=0.01):
    """Rp/Rs versus wavelength: a flat baseline plus water bands and a lambda^-4 haze.

    ``water_amp`` and ``haze_amp`` are fractional changes in radius, with the haze
    measured at 0.5 um.
    """
    wl = np.asarray(wavelength_um, dtype=float)
    water = sum(np.exp(-0.5 * ((wl - c) / w) ** 2) for c, w in _WATER_BANDS)
    haze = (wl / 0.5) ** -4
    return rp0 * (1.0 + water_amp * water + haze_amp * haze)
