import { useEffect, useRef, useState } from 'react'
import { BIOMES } from '../world/biomes.js'
import { Icon } from './Icon.jsx'

const project = ([lon, lat]) => [(lon - 39) * 60, (-lat - 10) * 60]
const cities = [
  ['Antsiranana', [49.3, -12.3], 14, -5],
  ['Mahajanga', [46.32, -15.72], -88, -8],
  ['Antananarivo', [47.52, -18.9], 15, 0],
  ['Toamasina', [49.4, -18.15], 14, 5],
  ['Morondava', [44.28, -20.28], -85, 1],
  ['Fianarantsoa', [47.08, -21.45], 13, 4],
  ['Toliara', [43.68, -23.35], -62, 0],
  ['Taolagnaro', [47.0, -25.03], 12, 15],
]
const peaks = [
  ['Maromokotro', '2 876 m', [48.97, -14.02]],
  ['Ankaratra', '2 642 m', [47.24, -19.36]],
  ['Pic Boby', '2 658 m', [46.88, -22.2]],
]
const riverPaths = [
  'M487 555 Q430 573 409 607 T330 621',
  'M463 676 Q420 691 408 737 T318 780',
  'M594 443 Q569 512 555 565 T517 676',
]

export function AtlasMap({ selected, onSelect, route }) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [layersOpen, setLayersOpen] = useState(false)
  const [layer, setLayer] = useState('relief')
  const [labels, setLabels] = useState(true)
  const [rivers, setRivers] = useState(true)
  const [outline, setOutline] = useState('')
  const drag = useRef(null)
  useEffect(() => {
    let active = true
    fetch('/data/madagascar.json')
      .then((r) => r.json())
      .then((rings) => {
        if (active)
          setOutline(
            rings.map((ring) => `M${ring.map((p) => project(p).join(',')).join('L')}Z`).join(' '),
          )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }
  const wheelZoom = (delta) => setZoom((z) => Math.max(0.8, Math.min(2.4, z + delta)))
  return (
    <div className="atlas-map">
      <div className="map-heading">
        <div className="eyebrow">
          <span className="live-dot" /> UN MONDE À PART ENTIÈRE
        </div>
        <h1>
          Madagascar<span>.</span>
        </h1>
        <p>Une île. Sept mondes. Votre histoire.</p>
      </div>
      <div className="map-view-switch">
        <span className="selected">
          <Icon name="map" size={15} /> Carte du monde
        </span>
        <span className="map-live">MONDE OUVERT</span>
      </div>
      <svg
        className="map-svg"
        viewBox="100 50 680 930"
        aria-label="Carte interactive des sept biomes de Madagascar"
        onWheel={(e) => wheelZoom(e.deltaY < 0 ? 0.1 : -0.1)}
        onPointerDown={(e) => {
          if (e.target.closest('[data-marker]')) return
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setOffset({
              x: drag.current.ox + (e.clientX - drag.current.x),
              y: drag.current.oy + (e.clientY - drag.current.y),
            })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" stroke="#9baaa0" strokeWidth=".55" opacity=".25" />
          </pattern>
          <filter id="island-shadow" x="-30%" y="-10%" width="160%" height="130%">
            <feDropShadow
              dx="-5"
              dy="10"
              stdDeviation="10"
              floodColor="#667763"
              floodOpacity=".22"
            />
          </filter>
          <clipPath id="coastline">
            <path d={outline} />
          </clipPath>
          <linearGradient id="biome-gradient" x1="0" x2="1">
            <stop stopColor="#c9b375" />
            <stop offset=".5" stopColor="#b87950" />
            <stop offset="1" stopColor="#527b59" />
          </linearGradient>
        </defs>
        <rect x="-500" y="-500" width="2000" height="2200" fill="url(#grid)" />
        <g
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) translate(440px,510px) scale(${zoom}) translate(-440px,-510px)`,
            transformOrigin: '0 0',
          }}
        >
          <path d={outline} fill="none" stroke="#b6cfc1" strokeWidth="25" opacity=".25" />
          <path d={outline} fill="none" stroke="#c4d9c7" strokeWidth="12" opacity=".7" />
          <image
            href="/images/atlas-relief.png"
            x="0"
            y="0"
            width="800"
            height="1000"
            filter="url(#island-shadow)"
          />
          {layer === 'biomes' && (
            <g clipPath="url(#coastline)" opacity=".47">
              <rect x="0" y="0" width="800" height="1000" fill="url(#biome-gradient)" />
              <path d="M400 100H700V300H400Z" fill="#52705b" />
              <path d="M200 740H500V1000H200Z" fill="#ce9360" />
              <path d="M560 380 600 400 470 920 455 850Z" fill="#267054" />
            </g>
          )}
          {rivers && (
            <g className="map-rivers">
              {riverPaths.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  stroke={i === 2 ? '#6aa9a0' : '#7a998d'}
                  fill="none"
                  strokeWidth={i === 2 ? 2 : 2.4}
                />
              ))}
            </g>
          )}
          <text className="ocean-label" x="210" y="470" transform="rotate(-69 210 470)">
            CANAL DU MOZAMBIQUE
          </text>
          <text className="ocean-label" x="678" y="600" transform="rotate(-69 678 600)">
            OCÉAN INDIEN
          </text>
          {route && (
            <path
              className="route-line"
              d={`M${BIOMES.map((b) => project(b.position).join(',')).join('L')}`}
              fill="none"
              stroke="#a44f37"
              strokeWidth="2"
              strokeDasharray="5 6"
            />
          )}
          {labels && (
            <g className="map-labels">
              {cities.map(([name, pos, dx, dy]) => {
                const [x, y] = project(pos)
                return (
                  <g key={name} transform={`translate(${x} ${y})`}>
                    <circle
                      r={name === 'Antananarivo' ? 3 : 2.5}
                      fill="#4b5145"
                      stroke="#f6f3e7"
                      strokeWidth="1.5"
                    />
                    <text x={dx} y={dy} className={name === 'Antananarivo' ? 'capital' : ''}>
                      {name}
                    </text>
                  </g>
                )
              })}
              {peaks.map(([name, height, pos]) => {
                const [x, y] = project(pos)
                return (
                  <g key={name} transform={`translate(${x} ${y})`}>
                    <path d="m-3 3 3-6 3 6Z" fill="#545243" />
                    <text x="10" y="0" className="peak">
                      {name}
                    </text>
                    <text x="10" y="14" className="height">
                      {height}
                    </text>
                  </g>
                )
              })}
              <text x="491" y="187" className="island-label">
                Nosy Be
              </text>
              <text x="631" y="380" className="island-label" transform="rotate(-60 631 380)">
                Sainte-Marie
              </text>
              <text x="375" y="621" className="river-label" transform="rotate(-18 375 621)">
                Tsiribihina
              </text>
              <text x="363" y="745" className="river-label" transform="rotate(-25 363 745)">
                Mangoky
              </text>
            </g>
          )}
          {BIOMES.map((b) => {
            const [x, y] = project(b.position)
            const active = b.id === selected.id
            return (
              <g
                key={b.id}
                data-marker="true"
                role="button"
                tabIndex="0"
                aria-label={`Découvrir ${b.name}`}
                aria-pressed={active}
                className={`map-marker ${active ? 'active' : ''}`}
                transform={`translate(${x} ${y})`}
                onClick={() => onSelect(b.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(b.id)
                  }
                }}
              >
                {active && (
                  <>
                    <circle className="marker-ring" r="31" />
                    <circle r="23" fill="#ae5b3d" opacity=".15" />
                  </>
                )}
                <circle
                  className="marker-body"
                  r={active ? 15 : 12}
                  fill={active ? '#a9553b' : '#faf8f0'}
                  stroke={active ? '#fff9ee' : b.color}
                  strokeWidth="1.7"
                />
                <text textAnchor="middle" dy="4" fill={active ? '#fff' : b.color}>
                  {b.number}
                </text>
                {active && (
                  <g transform="translate(-68 27)">
                    <rect width="136" height="28" rx="5" fill="#fffdf5" stroke="#dbcfbd" />
                    <text x="68" y="18" textAnchor="middle" className="selected-map-label">
                      {b.short}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="compass-rose">
        <span>N</span>
        <svg width="35" height="49" viewBox="0 0 35 49">
          <path d="M17.5 2 27 38 17.5 30 8 38Z" fill="#647160" />
          <path d="M17.5 2v28L8 38Z" fill="#a9b09d" />
        </svg>
      </div>
      <div className="map-controls">
        <button aria-label="Zoom avant" onClick={() => wheelZoom(0.2)} disabled={zoom >= 2.4}>
          <Icon name="plus" size={18} />
        </button>
        <button aria-label="Zoom arrière" onClick={() => wheelZoom(-0.2)} disabled={zoom <= 0.8}>
          <Icon name="minus" size={18} />
        </button>
        <span />
        <button aria-label="Recentrer la carte" onClick={reset}>
          <Icon name="compass" size={18} />
        </button>
      </div>
      <div className="layer-control">
        <button
          className={layersOpen ? 'open' : ''}
          onClick={() => setLayersOpen(!layersOpen)}
          aria-expanded={layersOpen}
        >
          <Icon name="layers" size={17} /> Calques <span>{layersOpen ? '−' : '+'}</span>
        </button>
        {layersOpen && (
          <div className="layers-popover">
            <strong>Affichage de la carte</strong>
            <div className="segmented">
              {['relief', 'biomes'].map((l) => (
                <button key={l} onClick={() => setLayer(l)} className={l === layer ? 'active' : ''}>
                  {l === 'relief' ? 'Relief' : 'Biomes'}
                </button>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />{' '}
              Villes & sommets
            </label>
            <label>
              <input
                type="checkbox"
                checked={rivers}
                onChange={(e) => setRivers(e.target.checked)}
              />{' '}
              Réseau hydrographique
            </label>
          </div>
        )}
      </div>
      <div className="map-scale">
        <div>
          <span>0</span>
          <span>{Math.round(100 / zoom)} km</span>
        </div>
        <i />
        <small>Relief illustré · géographie réelle</small>
      </div>
      <span className="map-coordinates">18°54′ S &nbsp; 47°31′ E</span>
    </div>
  )
}
