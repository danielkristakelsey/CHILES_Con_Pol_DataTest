from __future__ import annotations
import json
from pathlib import Path

from astropy.io import fits
import numpy as np


def analyze_fits(path: str | Path) -> dict:
    p = Path(path)
    with fits.open(p) as hdul:
        summary = {
            "path": str(p),
            "num_hdus": len(hdul),
            "hdus": [],
        }
        for i, h in enumerate(hdul):
            info: dict = {"index": i, "class": h.__class__.__name__}
            hdr = getattr(h, "header", None)
            if hdr is not None:
                # Capture a subset of header keys for brevity and filter out non-serializable items
                def _safe(v):
                    return isinstance(v, (str, int, float, bool, type(None)))

                head_map = {}
                taken = 0
                for k in hdr.keys():
                    if k in ("COMMENT", "HISTORY"):
                        continue
                    if taken >= 80:
                        break
                    try:
                        v = hdr[k]
                        if _safe(v):
                            head_map[k] = v
                            taken += 1
                    except Exception:
                        continue
                info["header"] = head_map
                info["naxis"] = hdr.get("NAXIS")
                for ax in range(1, (hdr.get("NAXIS") or 0) + 1):
                    info[f"NAXIS{ax}"] = hdr.get(f"NAXIS{ax}")
            data = getattr(h, "data", None)
            if data is not None:
                info["dtype"] = str(data.dtype)
                info["shape"] = list(data.shape)
                if np.size(data) > 0:
                    try:
                        info["min"] = float(np.nanmin(data))
                        info["max"] = float(np.nanmax(data))
                        info["mean"] = float(np.nanmean(data))
                    except Exception as e:  # pragma: no cover
                        info["stats_error"] = repr(e)
            summary["hdus"].append(info)
        return summary


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Analyze FITS file and print JSON summary")
    ap.add_argument("fits_path", nargs="?", default="1000hr_center.fits")
    ap.add_argument("--out", dest="out", default=None, help="Optional path to write JSON summary")
    args = ap.parse_args()

    summary = analyze_fits(args.fits_path)
    text = json.dumps(summary, indent=2)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text, encoding="utf-8")
    print(text)
