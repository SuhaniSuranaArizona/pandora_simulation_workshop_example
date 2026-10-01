import numpy as np
import pytest

from pandora_sim import PixelGrid, StellarSpectra, blackbody


@pytest.fixture(scope="session")
def grid():
    return PixelGrid(601)


@pytest.fixture(scope="session")
def wavelengths():
    return np.linspace(0.45, 1.65, 7)


@pytest.fixture(scope="session")
def spectra(wavelengths):
    """Blackbody stand-ins: 5000 K photosphere, cooler spots, hotter faculae."""
    return StellarSpectra(
        wavelengths,
        blackbody(wavelengths, 5000.0),
        blackbody(wavelengths, 4200.0),
        blackbody(wavelengths, 5200.0),
    )
