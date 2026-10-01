"""The browser model must reproduce the saved Python reference output."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_javascript_matches_python_reference():
    result = subprocess.run(
        ["node", str(ROOT / "tests/js/check_reference.mjs")], capture_output=True, text=True, cwd=ROOT
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_page3_correction_and_calibration():
    result = subprocess.run(
        ["node", str(ROOT / "tests/js/check_correction.mjs")], capture_output=True, text=True, cwd=ROOT
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_site_structure_accessibility_and_contrast():
    result = subprocess.run(
        ["node", str(ROOT / "tests/js/check_site.mjs")], capture_output=True, text=True, cwd=ROOT
    )
    assert result.returncode == 0, result.stdout + result.stderr
