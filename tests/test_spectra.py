import numpy as np
import pytest

from pandora_sim import SpectralGrid, blackbody, resample_flux_conserving, water_haze_radius_ratio


def make_grid(dtype=np.float64):
    teff = np.array([4000.0, 4500.0, 5000.0, 5500.0, 6000.0])
    logg = np.array([4.0, 4.5, 5.0])
    feh = np.array([-0.5, 0.0, 0.5])
    wl = np.linspace(0.4, 1.7, 50)
    flux = np.empty((teff.size, logg.size, feh.size, wl.size))
    for i, t in enumerate(teff):
        for j, g in enumerate(logg):
            for k, z in enumerate(feh):
                flux[i, j, k] = blackbody(wl, t) * (1 + 0.05 * (g - 4.5) + 0.02 * z)
    return SpectralGrid(teff, logg, feh, wl, flux.astype(dtype), {"source": "test"})


def test_grid_reproduces_nodes_exactly():
    g = make_grid()
    for i in (0, 2, 4):
        for j in (0, 1, 2):
            for k in (0, 2):
                np.testing.assert_allclose(
                    g.spectrum(g.teff[i], g.logg[j], g.feh[k]), g.flux[i, j, k], rtol=1e-12
                )


def test_grid_interpolates_between_nodes_monotonically():
    g = make_grid()
    lo, mid, hi = (g.spectrum(t, 4.5, 0.0) for t in (4500.0, 4750.0, 5000.0))
    assert np.all(lo < mid) and np.all(mid < hi)
    # log-linear interpolation of a smooth Planck curve over 500 K is accurate to a few per cent
    np.testing.assert_allclose(mid, blackbody(g.wavelength_um, 4750.0), rtol=0.05)


def test_grid_refuses_extrapolation():
    with pytest.raises(ValueError):
        make_grid().spectrum(3500.0, 4.5, 0.0)


def test_grid_round_trips_through_disk(tmp_path):
    g = make_grid(np.float32)
    g.save(tmp_path)
    back = SpectralGrid.load(tmp_path)
    np.testing.assert_array_equal(back.flux, g.flux)
    assert back.meta["source"] == "test"
    assert (tmp_path / "index.json").stat().st_size < 2000  # the index stays small


def test_resampling_conserves_flux():
    wl = np.linspace(0.4, 1.7, 200001)
    flux = 1.0 + 0.3 * np.sin(40 * wl) + wl**2
    edges = np.geomspace(0.45, 1.65, 120)
    out = resample_flux_conserving(wl, flux, edges)
    fine = np.linspace(edges[0], edges[-1], 2_000_001)
    integral_in = np.trapz(1.0 + 0.3 * np.sin(40 * fine) + fine**2, fine)
    np.testing.assert_allclose(np.sum(out * np.diff(edges)), integral_in, rtol=1e-6)


def test_resampling_rejects_out_of_range_bins():
    with pytest.raises(ValueError):
        resample_flux_conserving(np.linspace(0.5, 1.0, 10), np.ones(10), [0.4, 0.6])


def test_planet_spectrum_has_water_features_and_haze():
    wl = np.array([0.45, 0.6, 1.05, 1.13, 1.55])
    rp = water_haze_radius_ratio(wl, rp0=0.1)
    assert rp[3] > rp[2] and rp[3] > rp[4]  # water band at 1.13 um stands above its continuum
    assert rp[0] > rp[1]  # haze raises the blue radius
