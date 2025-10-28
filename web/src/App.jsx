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
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState(null)
  const imgRef = useRef(null)
  const [intensity, setIntensity] = useState(null)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [colormap, setColormap] = useState('grayscale')
  const [invert, setInvert] = useState(false)
  const [stretch, setStretch] = useState('linear')
  const [gamma, setGamma] = useState(1.0)
  const [asinhK, setAsinhK] = useState(0.1)

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

  useEffect(() => { draw() }, [scale, offset, colormap, invert, stretch, gamma, asinhK, intensity])

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

  function recolorIfNeeded() {
    const img = imgRef.current
    const intens = intensity
    if (!img || !intens) return null
    const w = img.width, h = img.height
    if (!colorCanvasRef.current) {
      colorCanvasRef.current = document.createElement('canvas')
      colorCanvasRef.current.width = w
      colorCanvasRef.current.height = h
    }
    const cc = colorCanvasRef.current
    const cctx = cc.getContext('2d')
    const out = cctx.createImageData(w, h)
    const outData = out.data
    const map = cmaps[colormap] || cmaps.grayscale
    for (let i = 0, j = 0; j < intens.length; j++, i += 4) {
      let t = intens[j] / 255
      t = applyStretch(t)
      if (invert) t = 1 - t
      const rgb = map(t)
      let r, g, b
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
      if (r === undefined) { const v = Math.round(t*255); r=g=b=v }
      outData[i] = r; outData[i+1] = g; outData[i+2] = b; outData[i+3] = 255
    }
    cctx.putImageData(out, 0, 0)
    return cc
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
    const colored = recolorIfNeeded()
    if (colored) ctx.drawImage(colored, -img.width/2, -img.height/2)
    else ctx.drawImage(img, -img.width/2, -img.height/2)
    ctx.restore()
  }

  const onWheel = (e) => {
    e.preventDefault()
    const delta = -e.deltaY
    const factor = Math.exp(delta * 0.001)
    setScale(s => Math.min(32, Math.max(0.05, s * factor)))
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

  return (
    <div className="page">
      <header className="bar">
        <button className="sidebtn" onClick={() => setSidebarOpen(s => !s)} aria-label="Toggle sidebar">☰</button>
        <div className="title">CHILES Viewer</div>
        {meta && (
          <div className="meta">
            {meta.shape && <span>{meta.shape[0]}×{meta.shape[1]}</span>}
            {meta.unit && <span>{meta.unit}</span>}
            <span>vmin {meta.vmin.toExponential(2)}</span>
            <span>vmax {meta.vmax.toExponential(2)}</span>
          </div>
        )}
      </header>
      <main className="viewport" onWheel={onWheel}>
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
          <div>Scale: {scale.toFixed(2)}×</div>
          <div>Offset: {offset.x.toFixed(0)}, {offset.y.toFixed(0)}</div>
        </div>
      </main>
      <footer className="foot">
        <div>
          Dark theme. Mouse wheel to zoom; drag to pan.
        </div>
      </footer>
    </div>
  )
}

