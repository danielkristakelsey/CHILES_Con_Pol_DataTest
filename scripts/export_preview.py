from __future__ import annotations
import json
from pathlib import Path
from typing import Tuple

import numpy as np
from astropy.io import fits
from PIL import Image


def percentile_scale(arr: np.ndarray, lo: float = 2.0, hi: float = 98.0) -> Tuple[np.ndarray, float, float]:
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return np.zeros_like(arr, dtype=np.uint8), 0.0, 1.0
    vmin = np.percentile(finite, lo)
    vmax = np.percentile(finite, hi)
    if vmax <= vmin:
        vmax = vmin + 1e-6
    scaled = (arr - vmin) / (vmax - vmin)
    scaled = np.clip(scaled, 0, 1)
    return (scaled * 255).astype(np.uint8), float(vmin), float(vmax)


def export_preview(fits_path: str | Path, out_png: str | Path, out_meta: str | Path) -> None:
    data = fits.getdata(fits_path)
    if data.ndim != 2:
        # If it's more than 2D, take the first plane
        while data.ndim > 2:
            data = data[0]
    img8, vmin, vmax = percentile_scale(data)
    im = Image.fromarray(img8)
    im.save(out_png)

    hdr = fits.getheader(fits_path)
    meta = {
        "shape": list(img8.shape[::-1]),  # width, height
        "vmin": vmin,
        "vmax": vmax,
        "unit": hdr.get("BUNIT", ""),
        "wcs": {
            "CTYPE1": hdr.get("CTYPE1"),
            "CTYPE2": hdr.get("CTYPE2"),
            "CRVAL1": hdr.get("CRVAL1"),
            "CRVAL2": hdr.get("CRVAL2"),
            "CRPIX1": hdr.get("CRPIX1"),
            "CRPIX2": hdr.get("CRPIX2"),
            "CDELT1": hdr.get("CDELT1"),
            "CDELT2": hdr.get("CDELT2"),
            "CUNIT1": hdr.get("CUNIT1"),
            "CUNIT2": hdr.get("CUNIT2"),
        },
    }
    Path(out_meta).parent.mkdir(parents=True, exist_ok=True)
    Path(out_meta).write_text(json.dumps(meta, indent=2), encoding="utf-8")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Export 8-bit preview and metadata from FITS")
    ap.add_argument("fits_path", nargs="?", default="1000hr_center.fits")
    ap.add_argument("--png", default="web/public/preview.png")
    ap.add_argument("--meta", default="web/public/metadata.json")
    args = ap.parse_args()
    Path(args.png).parent.mkdir(parents=True, exist_ok=True)
    export_preview(args.fits_path, args.png, args.meta)
    print(f"Wrote {args.png} and {args.meta}")

