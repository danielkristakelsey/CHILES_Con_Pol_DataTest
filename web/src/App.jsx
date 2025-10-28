import React, { useEffect, useMemo, useRef, useState } from 'react'
import { interpolateInferno, interpolateMagma, interpolatePlasma, interpolateViridis, interpolateCividis, interpolateTurbo, interpolateWarm, interpolateCool } from 'd3-scale-chromatic'
import { interpolateRgb } from 'd3-interpolate'

const BASE = import.meta.env.BASE_URL || '/'

function useMetadata() {
  const [meta, setMeta] = useState(null)
  useEffect(() => {
    fetch(`${BASE}metadata.json`).then(r => r.json()).then(setMeta)
  }, [])
  return meta
}

export default function App() {
  const meta = useMetadata()
  const canvasRef = useRef(null)
  const colorCanvasRef = useRef(null)
  const colorKeyRef = useRef('')
  const histCanvasRef = useRef(null)
  const colorbarRef = useRef(null)
  const imgRef = useRef(null)

  const [intensity, setIntensity] = useState(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState(null)
  const [cursor, setCursor] = useState({ x: null, y: null, ra: null, dec: null })

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [colormap, setColormap] = useState('grayscale')
  const [invert, setInvert] = useState(false)
  const [stretch, setStretch] = useState('linear')
  const [gamma, setGamma] = useState(1.0)
  const [asinhK, setAsinhK] = useState(0.1)
  const [hist, setHist] = useState(null)
  const [histDisplay, setHistDisplay] = useState(null)
  const [minCut, setMinCut] = useState(0.0)   // 0..1 of 8-bit scale
  const [maxCut, setMaxCut] = useState(1.0)   // 0..1 of 8-bit scale
  const [maskBelowMin, setMaskBelowMin] = useState(false)
  const [maskAboveMax, setMaskAboveMax] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.src = `${BASE}preview.png`
    img.onload = () => {
      imgRef.current = img
      const tmp = document.createElement('canvas')
      tmp.width = img.width
      tmp.height = img.height
      const tctx = tmp.getContext('2d')
      tctx.drawImage(img, 0, 0)
      const id = tctx.getImageData(0, 0, img.width, img.height)
      const src = id.data
      const N = img.width * img.height
      const gray = new Uint8Array(N)
      for (let i = 0, j = 0; i < src.length; i += 4, j++) gray[j] = src[i]
      setIntensity(gray)
      draw()
    }
  }, [])

  useEffect(() => { draw() }, [scale, offset])
  useEffect(() => { updateVisibleHistogram() }, [scale, offset, intensity, minCut, maxCut, stretch, invert, maskBelowMin, maskAboveMax])
  useEffect(() => { recomputeColor() }, [intensity, colormap, invert, stretch, gamma, asinhK, minCut, maxCut, maskBelowMin, maskAboveMax])
  useEffect(() => { renderColorbar() }, [colormap, invert, stretch, gamma, asinhK, minCut, maxCut])

  const cmaps = useMemo(() => ({
    grayscale: (t) => `rgb(${Math.round(t*255)},${Math.round(t*255)},${Math.round(t*255)})`,
    inferno: interpolateInferno,
    magma: interpolateMagma,
    plasma: interpolatePlasma,
    viridis: interpolateViridis,
    cividis: interpolateCividis,
    turbo: interpolateTurbo,
    warm: interpolateWarm,
    cool: interpolateCool,
  }), [])

  function applyStretch(x) {
    if (stretch === 'linear') return x
    if (stretch === 'log') {
      const eps = 1e-6
      return Math.log(eps + x) / Math.log(1 + eps)
    }
    if (stretch === 'sqrt') return Math.sqrt(x)
    if (stretch === 'asinh') return Math.asinh(x / Math.max(1e-6, asinhK)) / Math.asinh(1 / Math.max(1e-6, asinhK))
    if (stretch === 'gamma') return Math.pow(x, Math.max(1e-3, gamma))
    return x
  }

  function recomputeColor() {
    const img = imgRef.current
    const intens = intensity
    if (!img || !intens) return
    const w = img.width, h = img.height
    if (!colorCanvasRef.current) {
      colorCanvasRef.current = document.createElement('canvas')
      colorCanvasRef.current.width = w
      colorCanvasRef.current.height = h
    }
    const key = `${colormap}|${invert?'1':'0'}|${stretch}|${gamma}|${asinhK}|${minCut.toFixed(3)}|${maxCut.toFixed(3)}|${maskBelowMin?'1':'0'}|${maskAboveMax?'1':'0'}|${w}x${h}`
    if (colorKeyRef.current === key) return
    colorKeyRef.current = key
    const cc = colorCanvasRef.current
    const cctx = cc.getContext('2d')
    const out = cctx.createImageData(w, h)
    const outData = out.data
    const map = cmaps[colormap] || cmaps.grayscale
    // Build 256-color LUT once (includes min/max cuts)
    const lut = new Uint8Array(256*4)
    for (let v=0; v<256; v++) {
      let t = v/255
      // apply min/max window
      t = (t - minCut) / Math.max(1e-6, (maxCut - minCut))
      let alpha = 255
      if (t <= 0) {
        if (maskBelowMin) { alpha = 0; t = 0 }
        else { t = 0 }
      }
      if (t >= 1) {
        if (maskAboveMax) { alpha = 0; t = 1 }
        else { t = 1 }
      }
      t = applyStretch(t)
      if (invert) t = 1 - t
      const rgb = map(t)
      let r=0,g=0,b=0
      if (typeof rgb === 'string' && rgb.startsWith('#')) {
        const hex = rgb.slice(1)
        r = parseInt(hex.slice(0, 2), 16)
        g = parseInt(hex.slice(2, 4), 16)
        b = parseInt(hex.slice(4, 6), 16)
      } else if (typeof rgb === 'string' && rgb.startsWith('rgb')) {
        const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (m) { r = +m[1]; g = +m[2]; b = +m[3] }
      } else {
        const c = interpolateRgb('#000000', rgb)(1)
        const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (m) { r = +m[1]; g = +m[2]; b = +m[3] }
      }
      const idx = v*4; lut[idx]=r; lut[idx+1]=g; lut[idx+2]=b; lut[idx+3]=alpha
    }
    // Map intensities via LUT
    for (let i=0,j=0; j<intens.length; j++, i+=4) {
      const v = intens[j]
      const li = v*4
      outData[i] = lut[li]
      outData[i+1] = lut[li+1]
      outData[i+2] = lut[li+2]
      outData[i+3] = lut[li+3]
    }
    cctx.putImageData(out, 0, 0)
    // request a redraw
    draw()
  }

  function imgPixelFromClient(clientX, clientY) {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight / 2
    const ix = (x - cx - offset.x) / scale + img.width / 2
    const iy = (y - cy - offset.y) / scale + img.height / 2
    return { ix, iy }
  }

  function toRaDec(ix, iy) {
    if (!meta?.wcs) return { ra: null, dec: null }
    const { CRVAL1, CRVAL2, CRPIX1, CRPIX2, CDELT1, CDELT2 } = meta.wcs
    const dec0 = (CRVAL2 || 0) * Math.PI / 180
    const px = ix + 1
    const py = iy + 1
    const dra = ((px - (CRPIX1 || 0)) * (CDELT1 || 0)) / Math.max(1e-6, Math.cos(dec0))
    const ddec = (py - (CRPIX2 || 0)) * (CDELT2 || 0)
    const ra = (CRVAL1 || 0) + dra
    const dec = (CRVAL2 || 0) + ddec
    return { ra, dec }
  }

  const draw = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imgRef.current
    if (!canvas || !ctx || !img) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2 + offset.x, height / 2 + offset.y)
    ctx.scale(scale, scale)
    const colored = colorCanvasRef.current
    if (colored) ctx.drawImage(colored, -img.width/2, -img.height/2)
    else ctx.drawImage(img, -img.width/2, -img.height/2)

    // overlays in image coords
    // center marker
    ctx.strokeStyle = '#93a1ff'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.moveTo(0,-10); ctx.lineTo(0,10); ctx.stroke()

    // beam overlay (approximate)
    const hdr = meta?.wcs || {}
    const CDELT2 = Math.abs(hdr.CDELT2 || 0.0004166666)
    const BMAJ = meta?.wcs?.BMAJ || meta?.BMAJ || 0
    const BMIN = meta?.wcs?.BMIN || meta?.BMIN || 0
    const BPA = meta?.wcs?.BPA || meta?.BPA || 0
    if (BMAJ && BMIN) {
      const pixA = (BMAJ / CDELT2)
      const pixB = (BMIN / CDELT2)
      const x0 = -img.width/2 + 40
      const y0 = img.height/2 - 40
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(-BPA*Math.PI/180)
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(0,0,pixA/2,pixB/2,0,0,Math.PI*2); ctx.stroke(); ctx.restore()
    }

    // scale bar
    const pxPerDeg = 1/Math.max(1e-9, Math.abs(hdr.CDELT2 || 0.0004166666))
    const candidatesArcsec = [5,10,20,30,60,120,300,600]
    let picked = 60
    for (const a of candidatesArcsec) {
      const wpx = (a/3600) * pxPerDeg
      if (wpx >= 60 && wpx <= 180) { picked = a; break }
    }
    const wpx = (picked/3600) * pxPerDeg
    const label = picked >= 60 ? `${Math.round(picked/60)} arcmin` : `${picked} arcsec`
    const bx = img.width/2 - wpx - 40
    const by = img.height/2 - 30
    ctx.fillStyle = '#e6edf3'; ctx.strokeStyle = '#e6edf3'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + wpx, by); ctx.stroke()
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.textAlign = 'center'; ctx.fillText(label, bx + wpx/2, by - 6)

    ctx.restore()
  }

  const onWheel = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight / 2
    const delta = -e.deltaY
    const factor = Math.exp(delta * 0.001)
    setScale(prevScale => {
      const newScale = Math.min(32, Math.max(0.05, prevScale * factor))
      // keep point under cursor fixed
      const ix = (x - cx - offset.x) / prevScale + img.width / 2
      const iy = (y - cy - offset.y) / prevScale + img.height / 2
      const newOffsetX = x - cx - (ix - img.width / 2) * newScale
      const newOffsetY = y - cy - (iy - img.height / 2) * newScale
      setOffset({ x: newOffsetX, y: newOffsetY })
      return newScale
    })
  }

  function updateVisibleHistogram() {
    const canvas = canvasRef.current
    const img = imgRef.current
    const intens = intensity
    if (!canvas || !img || !intens) return
    const Wc = canvas.clientWidth
    const Hc = canvas.clientHeight
    const cx = Wc / 2
    const cy = Hc / 2
    const iw = img.width
    const ih = img.height
    // image bounds visible in image coords
    let ix0 = iw / 2 + (0 - cx - offset.x) / scale
    let ix1 = iw / 2 + (Wc - cx - offset.x) / scale
    let iy0 = ih / 2 + (0 - cy - offset.y) / scale
    let iy1 = ih / 2 + (Hc - cy - offset.y) / scale
    ix0 = Math.max(0, Math.floor(Math.min(ix0, ix1)))
    ix1 = Math.min(iw - 1, Math.ceil(Math.max(ix0, ix1)))
    iy0 = Math.max(0, Math.floor(Math.min(iy0, iy1)))
    iy1 = Math.min(ih - 1, Math.ceil(Math.max(iy0, iy1)))
    if (ix1 <= ix0 || iy1 <= iy0) return
    // sampling step to keep cost bounded
    const approxPixels = (ix1 - ix0) * (iy1 - iy0)
    const targetSamples = 160000
    const step = Math.max(1, Math.floor(Math.sqrt(approxPixels / targetSamples)))
    const counts = new Array(256).fill(0)
    const dcounts = new Array(256).fill(0)
    for (let y = iy0; y <= iy1; y += step) {
      const row = y * iw
      for (let x = ix0; x <= ix1; x += step) {
        const v = intens[row + x]
        counts[v]++
        // post display pipeline
        let t = v/255
        t = (t - minCut) / Math.max(1e-6, (maxCut - minCut))
        if (t <= 0) { if (maskBelowMin) continue; t = 0 }
        if (t >= 1) { if (maskAboveMax) continue; t = 1 }
        t = applyStretch(t)
        if (invert) t = 1 - t
        const b = Math.max(0, Math.min(255, Math.round(t*255)))
        dcounts[b]++
      }
    }
    setHist({ counts })
    setHistDisplay({ counts: dcounts })
    setTimeout(() => { renderHist(); renderHistDisplay() }, 0)
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY })
  }
  const onPointerMove = (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    setDrag({ x: e.clientX, y: e.clientY })
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
  }
  const onPointerUp = () => setDrag(null)
  const onMouseMove = (e) => {
    const p = imgPixelFromClient(e.clientX, e.clientY)
    if (!p) return
    const w = toRaDec(p.ix, p.iy)
    setCursor({ x: p.ix, y: p.iy, ra: w.ra, dec: w.dec })
  }

  // histogram
  useEffect(() => {
    if (!intensity) return
    const counts = new Array(256).fill(0)
    for (let i=0;i<intensity.length;i++) counts[intensity[i]]++
    setHist({ counts })
    setTimeout(renderHist, 0)
  }, [intensity])

  function renderHist() {
    const cvs = histCanvasRef.current
    if (!cvs || !hist) return
    const ctx = cvs.getContext('2d')
    const W = cvs.width = 320
    const H = cvs.height = 140
    ctx.clearRect(0,0,W,H)
    const counts = hist.counts
    const max = Math.max(...counts)
    ctx.fillStyle = '#203047'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle = '#4ea1ff'; ctx.beginPath()
    for (let i=0;i<256;i++) {
      const x = (i/255)*W
      const y = H - (counts[i]/max)*(H-20)
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
    }
    ctx.stroke()
    ctx.strokeStyle = '#54637a'; ctx.beginPath(); ctx.moveTo(0,H-0.5); ctx.lineTo(W,H-0.5); ctx.stroke()
    ctx.fillStyle = '#e6edf3'; ctx.font = '11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText('Histogram (pixel brightness)', 8, 14)
    if (meta?.vmin !== undefined && meta?.vmax !== undefined) {
      ctx.fillText(`${meta.vmin.toExponential(2)} to ${meta.vmax.toExponential(2)} ${meta.unit||''}`, 8, H-6)
    }
    const stats = countsToStats(counts)
    if (meta?.vmin !== undefined && meta?.vmax !== undefined) {
      const meanPhys = meta.vmin + (meta.vmax-meta.vmin)*stats.mean
      const medPhys = meta.vmin + (meta.vmax-meta.vmin)*stats.median
      const stdPhys = (meta.vmax-meta.vmin)*stats.std
      ctx.fillText(`mean ${meanPhys.toExponential(2)}, median ${medPhys.toExponential(2)}, std ${stdPhys.toExponential(2)}`, 8, 28)
    }
  }

  function renderColorbar() {
    const bar = colorbarRef.current
    if (!bar) return
    const W = bar.width = 240
    const H = bar.height = 12
    const ctx = bar.getContext('2d')
    const map = cmaps[colormap] || cmaps.grayscale
    for (let x=0;x<W;x++) {
      let t = x/(W-1)
      // colorbar shows post-cut normalized space
      t = applyStretch(t)
      if (invert) t = 1 - t
      const rgb = map(t)
      ctx.fillStyle = typeof rgb === 'string' ? rgb : '#000'
      ctx.fillRect(x, 0, 1, H)
    }
    ctx.strokeStyle = '#1a2230'; ctx.strokeRect(0.5,0.5,W-1,H-1)
  }

  function countsToStats(counts) {
    const total = counts.reduce((a,b)=>a+b,0)
    if (!total) return { mean:0, median:0, std:0 }
    let mean = 0
    for (let i=0;i<256;i++) mean += (i/255)*counts[i]
    mean /= total
    let cum=0, median=0
    for (let i=0;i<256;i++){ cum+=counts[i]; if (cum >= total/2){ median = i/255; break } }
    let varsum=0
    for (let i=0;i<256;i++){ const x=i/255; varsum += (x-mean)*(x-mean)*counts[i] }
    const std = Math.sqrt(varsum/total)
    return { mean, median, std }
  }

  function renderHistDisplay() {
    const el = document.getElementById('hist-display')
    if (!el || !histDisplay) return
    const ctx = el.getContext('2d')
    const W = el.width = 320
    const H = el.height = 140
    ctx.clearRect(0,0,W,H)
    const counts = histDisplay.counts
    const max = Math.max(...counts)
    ctx.fillStyle = '#203047'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle = '#ffa94d'; ctx.beginPath()
    for (let i=0;i<256;i++) {
      const x = (i/255)*W
      const y = H - (counts[i]/max)*(H-20)
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
    }
    ctx.stroke()
    ctx.strokeStyle = '#54637a'; ctx.beginPath(); ctx.moveTo(0,H-0.5); ctx.lineTo(W,H-0.5); ctx.stroke()
    ctx.fillStyle = '#e6edf3'; ctx.font = '11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    ctx.fillText('Histogram (post window/stretch)', 8, 14)
    const st = countsToStats(counts)
    ctx.fillText(`mean ${st.mean.toFixed(3)}, median ${st.median.toFixed(3)}, std ${st.std.toFixed(3)}`, 8, 28)
  }

  // Slider handlers (0..100 UI mapped to 0..1)
  function onMinCutChange(pct) {
    let v = Math.max(0, Math.min(100, pct)) / 100
    if (v > maxCut - 0.01) v = Math.max(0, maxCut - 0.01)
    setMinCut(v)
  }
  function onMaxCutChange(pct) {
    let v = Math.max(0, Math.min(100, pct)) / 100
    if (v < minCut + 0.01) v = Math.min(1, minCut + 0.01)
    setMaxCut(v)
  }

  return (
    <div className="page">
      <header className="bar">
        <button className="sidebtn" onClick={() => setSidebarOpen(s => !s)} aria-label="Toggle sidebar">Menu</button>
        <div className="title">CHILES Viewer</div>
        {meta && (
          <div className="meta">
            {meta.shape && <span>{meta.shape[0]}x{meta.shape[1]}</span>}
            {meta.unit && <span>{meta.unit}</span>}
            <span>vmin {meta.vmin.toExponential(2)}</span>
            <span>vmax {meta.vmax.toExponential(2)}</span>
          </div>
        )}
        <button className="sidebtn" onClick={() => setRightOpen(s => !s)} aria-label="Toggle analytics">Analytics</button>
      </header>
      <main className="viewport" onWheel={onWheel} onMouseMove={onMouseMove}>
        <aside className={"sidebar " + (sidebarOpen ? 'open' : 'closed')}>
          <div className="section">
            <div className="section-title">Color Map</div>
            <select value={colormap} onChange={e => setColormap(e.target.value)}>
              <option value="grayscale">Grayscale</option>
              <option value="inferno">Inferno</option>
              <option value="magma">Magma</option>
              <option value="plasma">Plasma</option>
              <option value="viridis">Viridis</option>
              <option value="cividis">Cividis</option>
              <option value="turbo">Turbo</option>
              <option value="warm">Warm</option>
              <option value="cool">Cool</option>
            </select>
            <label className="line"><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} /> Invert</label>
            <div className="line"><canvas ref={colorbarRef} /></div>
          </div>
          <div className="section">
            <div className="section-title">Stretch</div>
            <select value={stretch} onChange={e => setStretch(e.target.value)}>
              <option value="linear">Linear</option>
              <option value="log">Log</option>
              <option value="sqrt">Sqrt</option>
              <option value="asinh">Asinh</option>
              <option value="gamma">Gamma</option>
            </select>
            {stretch === 'gamma' && (
              <label className="line">Gamma
                <input type="range" min="0.1" max="4" step="0.1" value={gamma} onChange={e => setGamma(parseFloat(e.target.value))} />
                <span className="val">{gamma.toFixed(1)}</span>
              </label>
            )}
            {stretch === 'asinh' && (
              <label className="line">Asinh k
                <input type="range" min="0.001" max="2" step="0.001" value={asinhK} onChange={e => setAsinhK(parseFloat(e.target.value))} />
                <span className="val">{asinhK.toFixed(3)}</span>
              </label>
            )}
          </div>
        </aside>
        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <div className="hud">
          <div>Scale: {scale.toFixed(2)}x</div>
          <div>Offset: {offset.x.toFixed(0)}, {offset.y.toFixed(0)}</div>
          {cursor.ra != null && (
            <div>RA {fmtRA(cursor.ra)} Dec {fmtDec(cursor.dec)}</div>
          )}
        </div>
        <aside className={"rpanel " + (rightOpen ? 'open' : 'closed')}>
          <div className="rhead">
            <div className="section-title">Analytics</div>
            <button className="sidebtn" onClick={() => setRightOpen(s=>!s)} aria-label="Toggle right panel">{rightOpen ? 'Close' : 'Open'}</button>
          </div>
          <div className="section">
            <div className="section-title">Brightness Distribution</div>
            <canvas ref={histCanvasRef} />
            <div className="section-title" style={{marginTop:8}}>Post-Scaling Distribution</div>
            <canvas id="hist-display" />
          </div>
        </aside>
      </main>
      <footer className="foot">
        <div>Dark theme. Wheel zoom focuses on cursor; drag to pan.</div>
        <div className="bottom-controls">
          <div className="line">
            <span className="section-title">Brightness</span>
            <label>Min
              <input type="range" min="0" max="100" step="1" value={Math.round(minCut*100)} onChange={e => onMinCutChange(parseInt(e.target.value,10))} />
              <span className="val">{Math.round(minCut*100)}%</span>
            </label>
            <label>Max
              <input type="range" min="0" max="100" step="1" value={Math.round(maxCut*100)} onChange={e => onMaxCutChange(parseInt(e.target.value,10))} />
              <span className="val">{Math.round(maxCut*100)}%</span>
            </label>
            {meta?.vmin !== undefined && meta?.vmax !== undefined && (
              <>
                <label>Min value
                  <input type="number" step="any" value={(meta.vmin + (meta.vmax-meta.vmin)*minCut)} onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) {
                      const nc = (v - meta.vmin)/Math.max(1e-12,(meta.vmax-meta.vmin))
                      onMinCutChange(Math.round(100*Math.max(0,Math.min(1,nc))))
                    }
                  }} />
                </label>
                <label>Max value
                  <input type="number" step="any" value={(meta.vmin + (meta.vmax-meta.vmin)*maxCut)} onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) {
                      const nc = (v - meta.vmin)/Math.max(1e-12,(meta.vmax-meta.vmin))
                      onMaxCutChange(Math.round(100*Math.max(0,Math.min(1,nc))))
                    }
                  }} />
                </label>
                <span className="val">{meta.unit||''}</span>
              </>
            )}
            <label className="line"><input type="checkbox" checked={maskBelowMin} onChange={e => setMaskBelowMin(e.target.checked)} /> Mask below min</label>
            <label className="line"><input type="checkbox" checked={maskAboveMax} onChange={e => setMaskAboveMax(e.target.checked)} /> Mask above max</label>
          </div>
        </div>
      </footer>
    </div>
  )
}

function fmtRA(raDeg) {
  if (raDeg == null || isNaN(raDeg)) return '--'
  let ra = ((raDeg/15) % 24 + 24) % 24
  const h = Math.floor(ra)
  const m = Math.floor((ra - h)*60)
  const s = ((ra - h)*60 - m)*60
  return `${pad2(h)}h${pad2(m)}m${s.toFixed(2)}s`
}
function fmtDec(decDeg) {
  if (decDeg == null || isNaN(decDeg)) return '--'
  const sign = decDeg >= 0 ? '+' : '-'
  const a = Math.abs(decDeg)
  const d = Math.floor(a)
  const mFloat = (a - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return `${sign}${pad2(d)}d${pad2(m)}m${s.toFixed(1)}s`
}
function pad2(n){ return String(n).padStart(2,'0') }
