"""Save Python reference outputs that the JavaScript port must reproduce.

Run from the repository root: ``PYTHONPATH=src python scripts/make_reference_cases.py``.
Writes tests/reference/cases.json; check it with ``node tests/js/check_reference.mjs``.
"""

import json
from pathlib import Path

import numpy as np

from pandora_sim import (Feature, LimbDarkening, Orbit, PixelGrid, Star, StellarSpectra, blackbody,
                         simulate_transit, water_haze_radius_ratio)

WL = np.linspace(0.45, 1.65, 6)
GRID_N = 121


def case(name, teffs, features, inclination, obliquity, prot, orbit, times, rp_spec, ld_u1, ld_u2):
    phot, spot, fac = teffs
    spectra = StellarSpectra(WL, blackbody(WL, phot), blackbody(WL, spot), blackbody(WL, fac))
    star = Star([Feature(*f) for f in features], inclination, obliquity, prot)
    rp = water_haze_radius_ratio(WL, *rp_spec)
    ld = LimbDarkening(np.asarray(ld_u1), np.asarray(ld_u2))
    sim = simulate_transit(star, spectra, Orbit(*orbit), rp, times, ld, PixelGrid(GRID_N))
    return {
        "name": name,
        "grid_n": GRID_N,
        "wavelength": WL.tolist(),
        "teffs": list(teffs),
        "star": {"features": [dict(kind=f[0], lat=f[1], lon=f[2], radius=f[3]) for f in features],
                 "inclination": inclination, "obliquity": obliquity, "prot": prot},
        "orbit": {"period": orbit[0], "aOverRs": orbit[1], "inc": orbit[2], "t0": orbit[3]},
        "times": list(times),
        "planet": {"rp0": rp_spec[0], "waterAmp": rp_spec[1], "hazeAmp": rp_spec[2]},
        "rp": rp.tolist(),
        "ld": {"u1": list(ld_u1), "u2": list(ld_u2)},
        "expected": {
            "flux": sim.flux.tolist(),
            "starFlux": sim.star_flux.tolist(),
            "coverage": sim.coverage.tolist(),  # [time][component][wavelength]
        },
    }


chromatic = (np.linspace(0.65, 0.2, 6).tolist(), np.linspace(0.25, 0.1, 6).tolist())
flat = ([0.4] * 6, [0.25] * 6)
cases = [
    case("clean star", (3500, 3100, 3600), [], 90.0, 0.0, None,
         (3.0, 14.0, 89.3, 0.0), [-0.05, -0.02, 0.0, 0.02, 0.05], (0.06, 0.05, 0.0), *flat),
    case("unocculted spots and faculae, chromatic LD", (3500, 3100, 3600),
         [("spot", 35, -25, 14), ("spot", -30, 30, 10), ("faculae", -60, -40, 12)],
         90.0, 0.0, 12.0, (3.0, 14.0, 89.3, 0.0), [-0.03, 0.0, 0.03], (0.06, 0.05, 0.01), *chromatic),
    case("spot on the planet's path, rotating", (4500, 3900, 4600),
         [("spot", 12, 0, 15), ("faculae", 15, 30, 10), ("spot", 50, -40, 12)],
         90.0, 0.0, 6.0, (3.0, 9.0, 88.7, 0.0), np.linspace(-0.07, 0.07, 9).tolist(), (0.06, 0.05, 0.0), *chromatic),
    case("tilted spin axis, obliquity, limb features", (3500, 3100, 3600),
         [("spot", 10, 75, 20), ("faculae", -20, -80, 25), ("spot", -45, 10, 18)],
         70.0, 25.0, 8.0, (3.0, 14.0, 89.0, 0.0), [-0.04, -0.01, 0.0, 0.01, 0.04, 1.0, -1.5],
         (0.06, 0.05, 0.01), *chromatic),
]
out = Path("tests/reference/cases.json")
out.write_text(json.dumps(cases))
print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB, {len(cases)} cases)")
