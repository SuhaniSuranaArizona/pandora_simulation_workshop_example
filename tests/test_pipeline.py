import json

import numpy as np
import pytest

from pandora_sim import SpectralGrid
from pipeline import build_grids as bg


def test_phoenix_naming():
    assert bg.spectrum_name(5800, 4.5, 0.0) == "lte05800-4.50-0.0.PHOENIX-ACES-AGSS-COND-2011-HiRes.fits"
    assert bg.spectrum_name(3200, 5.0, 0.5).startswith("lte03200-5.00+0.5.")
    assert bg.spectrum_url(5800, 4.5, -0.5).endswith("/Z-0.5/lte05800-4.50-0.5.PHOENIX-ACES-AGSS-COND-2011-HiRes.fits")
    assert "/Z-0.0/" in bg.spectrum_url(5800, 4.5, 0.0)


def test_log_edges_have_constant_resolving_power():
    e = bg.log_wavelength_edges(0.4, 1.7, 1000.0)
    assert e[0] == 0.4 and e[-1] >= 1.7
    np.testing.assert_allclose(e[1:] / e[:-1], np.exp(1 / 1000.0))


def test_no_download_without_flag(tmp_path):
    with pytest.raises(FileNotFoundError, match="--download"):
        bg.fetch("https://example.invalid/x.fits", tmp_path / "x.fits", download=False)
    assert not list(tmp_path.iterdir())


def test_synthetic_build_writes_labelled_grid(tmp_path):
    out = tmp_path / "grid"
    bg.main(["--synthetic", "--out", str(out), "--teff", "4000:5000:500", "--logg", "4.5:4.5:0.5",
             "--feh", "0:0:0.5", "--resolution", "200"])
    index = json.loads((out / "index.json").read_text())
    assert index["realistic"] is False and index["source"] == "blackbody-placeholder"
    assert (out / "build_log.json").exists()
    g = SpectralGrid.load(out)
    assert g.flux.shape[:3] == (3, 1, 1) and np.all(g.flux > 0)
