"""Analytic transit light source effect (TLSE) correction factor."""

import numpy as np


def epsilon(f_spot, f_fac, s_spot, s_fac, s_phot):
    """Stellar correction factor epsilon_lambda.

    The observed depth of a transit whose chord is free of spots and faculae is the
    true depth times epsilon. ``f_spot`` and ``f_fac`` are the flux-weighted covering
    fractions of the visible disk, and the ``s_*`` arguments are the component spectra.
    All arguments broadcast against each other.
    """
    s_phot = np.asarray(s_phot, dtype=float)
    dimming = (
        1.0
        - np.asarray(f_spot) * (1.0 - np.asarray(s_spot) / s_phot)
        - np.asarray(f_fac) * (1.0 - np.asarray(s_fac) / s_phot)
    )
    return 1.0 / dimming
