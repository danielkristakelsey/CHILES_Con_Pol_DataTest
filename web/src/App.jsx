import React, { useEffect, useRef, useState } from 'react'

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
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState(null)
  const imgRef = useRef(null)

  useEffect(() => {
    const img = new Image()
    img.src = `${BASE}preview.png`
    img.onload = () => {
      imgRef.current = img
      draw()
    }
  }, [])

  useEffect(() => {
    draw()
  }, [scale, offset])

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
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
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
  const onPointerUp = (e) => {
    setDrag(null)
  }

  return (
    <div className="page">
      <header className="bar">
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

