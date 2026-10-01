"""Build the compact stellar spectral grid that the site loads.

Steps: (1) fetch PHOENIX spectra, (2) trim and resample, (3) tabulate over
(teff, logg, [Fe/H]), (4) write compressed arrays, a JSON index and a build log.

Nothing is downloaded unless ``--download`` is passed, and raw files are cached in
``data/raw`` so a rebuild never refetches. ``--synthetic`` builds a blackbody PLACEHOLDER
grid (index.json says ``"realistic": false``) so the rest of the stack can run offline.

Source: Goettingen spectral library, PHOENIX-ACES-AGSS-COND-2011
(https://phoenix.astro.physik.uni-goettingen.de). Confirm its licence and citation
requirements (Husser et al. 2013, A&A 553, A6) before redistributing any derived grid.
"""

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from pandora_sim.spectra import SpectralGrid, blackbody, resample_flux_conserving

BASE = "https://phoenix.astro.physik.uni-goettingen.de/data/HiResFITS"
MODEL = "PHOENIX-ACES-AGSS-COND-2011"
WAVE_FILE = f"WAVE_{MODEL}.fits"


def feh_tag(feh: float) -> str:
    """PHOENIX writes solar metallicity as -0.0 and others with an explicit sign."""
    return f"-{abs(feh):.1f}" if feh <= 0 else f"+{feh:.1f}"


def spectrum_name(teff, logg, feh) -> str:
    return f"lte{int(round(teff)):05d}-{logg:.2f}{feh_tag(feh)}.{MODEL}-HiRes.fits"


def spectrum_url(teff, logg, feh) -> str:
    return f"{BASE}/{MODEL}/Z{feh_tag(feh)}/{spectrum_name(teff, logg, feh)}"


def log_wavelength_edges(lo_um, hi_um, resolution):
    """Bin edges with constant lambda / delta-lambda = ``resolution``."""
    n = int(np.ceil(np.log(hi_um / lo_um) * resolution))
    return lo_um * np.exp(np.arange(n + 1) / resolution)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url: str, dest: Path, download: bool) -> Path:
    if dest.exists():
        return dest
    if not download:
        raise FileNotFoundError(f"{dest} is missing; rerun with --download to fetch {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)
    return dest


def build_phoenix(axes, edges, raw_dir: Path, download: bool, dtype):
    from astropy.io import fits

    wave_path = fetch(f"{BASE}/{WAVE_FILE}", raw_dir / WAVE_FILE, download)
    wave_um = fits.getdata(wave_path).astype(float) * 1e-4  # Angstrom -> um
    keep = (wave_um >= edges[0] * 0.98) & (wave_um <= edges[-1] * 1.02)
    wave_um = wave_um[keep]
    teff, logg, feh = axes
    flux = np.empty((teff.size, logg.size, feh.size, edges.size - 1), dtype=dtype)
    files = []
    for i, t in enumerate(teff):
        for j, g in enumerate(logg):
            for k, z in enumerate(feh):
                path = fetch(spectrum_url(t, g, z), raw_dir / spectrum_name(t, g, z), download)
                raw = fits.getdata(path).astype(float)[keep]
                flux[i, j, k] = resample_flux_conserving(wave_um, raw, edges)
                files.append({"name": path.name, "sha256": sha256(path)})
    files.append({"name": WAVE_FILE, "sha256": sha256(wave_path)})
    return flux, files


def build_synthetic(axes, edges, dtype):
    teff, logg, feh = axes
    centres = np.sqrt(edges[:-1] * edges[1:])
    flux = np.empty((teff.size, logg.size, feh.size, centres.size), dtype=dtype)
    for i, t in enumerate(teff):
        flux[i, :, :] = blackbody(centres, t)
    return flux, []


def frange(spec: str) -> np.ndarray:
    lo, hi, step = (float(x) for x in spec.split(":"))
    return np.arange(lo, hi + step / 2, step)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path("data/grids/phoenix_v1"))
    ap.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    ap.add_argument("--teff", default="3000:6000:100", help="lo:hi:step in K")
    ap.add_argument("--logg", default="4.0:5.0:0.5")
    ap.add_argument("--feh", default="-0.5:0.5:0.5")
    ap.add_argument("--wave", default="0.4:1.7", help="lo:hi in micron")
    ap.add_argument("--resolution", type=float, default=1000.0, help="lambda/delta-lambda of the output grid")
    ap.add_argument("--download", action="store_true", help="allow fetching missing PHOENIX files")
    ap.add_argument("--synthetic", action="store_true", help="blackbody placeholder grid, no network")
    ap.add_argument("--version", default="0.1.0")
    a = ap.parse_args(argv)

    axes = (frange(a.teff), frange(a.logg), frange(a.feh))
    lo, hi = (float(x) for x in a.wave.split(":"))
    edges = log_wavelength_edges(lo, hi, a.resolution)
    dtype = np.float32
    if a.synthetic:
        flux, files = build_synthetic(axes, edges, dtype)
        source = "blackbody-placeholder"
    else:
        flux, files = build_phoenix(axes, edges, a.raw_dir, a.download, dtype)
        source = MODEL
    centres = np.sqrt(edges[:-1] * edges[1:])
    meta = {
        "version": a.version,
        "source": source,
        "realistic": not a.synthetic,
        "resolution": a.resolution,
        "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": " ".join(sys.argv if argv is None else ["build_grids.py", *argv]),
        "input_files": files,
    }
    SpectralGrid(*axes, centres, flux, meta).save(a.out)
    (a.out / "build_log.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {a.out} ({flux.shape}, {flux.nbytes / 1e6:.1f} MB before compression)")


if __name__ == "__main__":
    main()
