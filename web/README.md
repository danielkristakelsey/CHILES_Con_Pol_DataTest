CHILES Viewer (React + Vite)

Local quickstart

- Install Node.js 18+.
- From `web/`, run `npm install` then `npm run dev`.
- The app expects preview assets at `web/public/preview.png` and `web/public/metadata.json`.

Regenerate preview assets from FITS

- Create a venv and install deps (already done in this workspace):
  - `py -m venv .venv`
  - `.\.venv\Scripts\python -m pip install astropy pillow`
- Generate assets:
  - `.\.venv\Scripts\python ..\scripts\export_preview.py`

Build for GitHub Pages

- Set the Vite base to your repo name: `set VITE_BASE=/YOUR_REPO_NAME/` (Windows) or `export VITE_BASE=/YOUR_REPO_NAME/` (bash).
- Run `npm run build`; deploy `web/dist/` to the `gh-pages` branch or enable Pages from `/docs` and move `dist` there.

Planned features

- Color map + stretch controls (linear/log/asinh).
- WCS cursor readout (RA/Dec).
- Tile pyramid for deep zoom and faster loading.
- Optional three.js GPU path for large data.

