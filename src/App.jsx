import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BIOMES, getBiome } from './world/biomes.js'
import { Icon } from './ui/Icon.jsx'
import { AtlasMap } from './ui/AtlasMap.jsx'
import { useGameStore } from './state/useGameStore.js'

const Game = lazy(() => import('./game/Game.jsx'))
function readProgress() {
  try {
    const value = JSON.parse(window.localStorage.getItem('madagascar-atlas') || '{}')
    return {
      visited: Array.isArray(value.visited)
        ? [...new Set(value.visited)].filter((id) => BIOMES.some((b) => b.id === id))
        : [],
      saved: Array.isArray(value.saved)
        ? [...new Set(value.saved)].filter((id) => BIOMES.some((b) => b.id === id))
        : [],
    }
  } catch {
    return { visited: [], saved: [] }
  }
}

export default function App() {
  const [selectedId, setSelectedId] = useState('highlands')
  const [tab, setTab] = useState('explore')
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState(readProgress)
  const [route, setRoute] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [sound, setSound] = useState(false)
  const [toast, setToast] = useState('')
  const [detailTab, setDetailTab] = useState('overview')
  const selected = getBiome(selectedId)
  const currentBiomeId = useGameStore((state) => state.currentBiome)
  const gameReady = useGameStore((state) => state.isReady)
  const playingBiome = getBiome(currentBiomeId)
  useEffect(() => {
    if (playing && gameReady && currentBiomeId)
      setProgress((p) =>
        p.visited.includes(currentBiomeId) ? p : { ...p, visited: [...p.visited, currentBiomeId] },
      )
  }, [playing, gameReady, currentBiomeId])
  const modalRef = useRef(null)
  const saved = progress.saved.includes(selectedId)
  useEffect(() => {
    if (!playing) return
    const keydown = (e) => {
      if (e.code === 'KeyM') {
        document.exitPointerLock?.()
        setPlaying(false)
        useGameStore.setState({ hasStarted: false, isReady: false, isPointerLocked: false })
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [playing])

  useEffect(() => {
    try {
      window.localStorage.setItem('madagascar-atlas', JSON.stringify(progress))
    } catch {
      /* private browsing */
    }
  }, [progress])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!modal) return
    const previous = document.activeElement
    const dialog = modalRef.current
    dialog?.focus()
    const keydown = (e) => {
      if (e.key === 'Escape') setModal(null)
      if (e.key === 'Tab') {
        const nodes = dialog?.querySelectorAll('button, input, [tabindex="0"]')
        if (!nodes?.length) return
        if (
          e.shiftKey &&
          (document.activeElement === nodes[0] || document.activeElement === dialog)
        ) {
          e.preventDefault()
          nodes[nodes.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
          e.preventDefault()
          nodes[0].focus()
        }
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [modal])
  useEffect(() => {
    if (!sound) return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let previous = 0
    for (let i = 0; i < data.length; i++) {
      previous = (previous + Math.random() * 0.04 - 0.02) / 1.02
      data[i] = previous * 3
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = selected.rain > 0.5 ? 1400 : 450
    const gain = ctx.createGain()
    gain.gain.value = 0.16
    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    ctx.resume().catch(() => {})
    return () => {
      source.stop()
      ctx.close().catch(() => {})
    }
  }, [sound, selected.rain])

  function select(id) {
    setSelectedId(id)
    setDetailTab('overview')
  }
  function explore() {
    useGameStore.setState({
      selectedBiome: selectedId,
      currentBiome: selectedId,
      hasStarted: true,
      isReady: false,
      mode: 'onFoot',
      activeVehicleId: null,
      showHelp: false,
    })
    setPlaying(true)
  }
  function leaveGame() {
    document.exitPointerLock?.()
    setPlaying(false)
    useGameStore.setState({ hasStarted: false, isReady: false, isPointerLocked: false })
  }
  function toggleSave() {
    setProgress((p) => ({
      ...p,
      saved: saved ? p.saved.filter((id) => id !== selectedId) : [...p.saved, selectedId],
    }))
    setToast(saved ? 'Étape retirée du carnet.' : 'Étape ajoutée à votre carnet de voyage.')
  }

  if (playing)
    return (
      <div className="game-shell">
        <Suspense
          fallback={
            <div className="game-loading">
              <span className="loading-orbit" />
              Votre voyage commence…<small>Préparation du terrain et de la végétation</small>
            </div>
          }
        >
          <Game />
        </Suspense>
        <button className="back-to-atlas" onClick={leaveGame}>
          <Icon name="map" size={17} /> Retour à l’atlas <kbd>M</kbd>
        </button>
        <div className="game-region">
          <span className="eyebrow">EXPLORATION LIBRE · PROTOTYPE 3D</span>
          <h2>{playingBiome.name}</h2>
          <p>ZQSD / WASD · Marcher &nbsp; ⇧ · Courir &nbsp; Espace · Sauter</p>
          <small>H · Commandes &nbsp; M · Atlas &nbsp; Échap · Libérer la souris</small>
        </div>
      </div>
    )

  return (
    <div className="atlas-app">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setTab('explore')
          }}
          aria-label="Madagascar, accueil"
        >
          <span className="brand-mark">
            <svg viewBox="0 0 38 38" fill="none">
              <path d="m6 27 9-17 6 10 4-7 8 14H6Z" stroke="currentColor" strokeWidth="1.7" />
              <path d="m11 19 4 3 4-5m3 4 3 2 3-3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="26" cy="8" r="2" fill="currentColor" />
            </svg>
          </span>
          <span>
            MADAGASCAR<small>THE RED ISLAND</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Navigation principale">
          <button className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>
            <Icon name="compass" size={17} />
            Explorer
          </button>
          <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>
            <Icon name="book" size={17} />
            Carnet de voyage{' '}
            {progress.saved.length > 0 && (
              <span className="nav-count">{progress.saved.length}</span>
            )}
          </button>
          <button onClick={() => setModal('about')}>
            Le projet <span className="nav-external">↗</span>
          </button>
        </nav>
        <div className="header-right">
          <span className="alpha-badge">
            <i /> VERSION ALPHA
          </span>
          <button
            className="round-button"
            aria-label="À propos et commandes"
            onClick={() => setModal('help')}
          >
            <Icon name="settings" size={19} />
          </button>
          <div className="avatar" title="Explorateur">
            E
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="region-sidebar">
          <div className="sidebar-title">
            <span className="eyebrow">L’ÎLE-CONTINENT</span>
            <h2>
              À chaque région,
              <br />
              un nouveau monde.
            </h2>
            <p>Suivez votre curiosité.</p>
          </div>
          <div className="region-list-heading">
            <span>LES 7 BIOMES</span>
            <span>07</span>
          </div>
          <div className="region-search">
            <Icon name="search" size={15} />
            <input
              aria-label="Rechercher une région"
              placeholder="Rechercher une région"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Effacer la recherche">
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
          <div className="region-list">
            {BIOMES.filter((b) =>
              `${b.name} ${b.region}`
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .includes(
                  query
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase(),
                ),
            ).map((b) => (
              <button
                className={`region-item ${b.id === selectedId ? 'active' : ''}`}
                key={b.id}
                onClick={() => {
                  select(b.id)
                  setTab('explore')
                }}
                aria-pressed={b.id === selectedId}
              >
                <span className="region-icon" style={{ '--biome': b.color }}>
                  <Icon name={b.icon} size={22} />
                </span>
                <span className="region-copy">
                  <small>{b.region}</small>
                  <strong>{b.short}</strong>
                </span>
                <span className="region-number">
                  {progress.visited.includes(b.id) ? <Icon name="check" size={14} /> : b.number}
                </span>
                {b.id === selectedId && <span className="selection-edge" />}
              </button>
            ))}
            {query &&
              !BIOMES.some((b) =>
                `${b.name} ${b.region}`
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .includes(
                    query
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toLowerCase(),
                  ),
              ) && (
                <p className="no-results">
                  Aucune région trouvée.
                  <br />
                  <button onClick={() => setQuery('')}>Voir les sept biomes</button>
                </p>
              )}
          </div>
          <div className="expedition-card">
            <span className="expedition-icon">
              <Icon name="compass" size={25} />
            </span>
            <span className="eyebrow">PRENEZ LE TEMPS DE VOUS PERDRE</span>
            <h3>L’aventure n’attend que vous.</h3>
            <p>
              Des hautes terres aux lagons,
              <br />
              imaginez votre traversée.
            </p>
            <button onClick={() => setModal('route')}>
              {route ? 'Voir ma traversée' : 'Préparer une traversée'}
              <Icon name="arrow" size={17} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <span className="flag-mg">
              <i />
              <i />
              <i />
            </span>
            <span>Inspiré du réel. Fait pour explorer.</span>
          </div>
        </aside>

        {tab === 'explore' ? (
          <main className="explorer-main">
            <div className="explorer-topline">
              <div>
                <span>EXPLORATION</span>
                <Icon name="chevron" size={12} />
                <strong>Carte de Madagascar</strong>
              </div>
              <span>
                <Icon name="sun" size={15} /> Saison sèche <i /> Mai — Octobre
              </span>
            </div>
            <div className="map-and-detail">
              <AtlasMap selected={selected} onSelect={select} route={route} />
              <aside className="biome-detail" key={selectedId}>
                <div className="detail-image">
                  <img src={`/images/${selected.image}.jpg`} alt={`Paysage de ${selected.name}`} />
                  <span className="detail-badge">
                    <i style={{ background: selected.color }} /> BIOME {selected.number}
                  </span>
                  <button
                    aria-label={saved ? 'Retirer du carnet' : 'Ajouter au carnet'}
                    className={`save-button ${saved ? 'saved' : ''}`}
                    onClick={toggleSave}
                  >
                    <Icon name={saved ? 'check' : 'flag'} size={17} />
                  </button>
                  <span className="image-caption">
                    <Icon name="pin" size={12} />
                    {selected.region === 'CENTRE' ? 'Hautes terres de Madagascar' : selected.region}
                  </span>
                </div>
                <div className="detail-content">
                  <span className="eyebrow" style={{ color: selected.color }}>
                    {selected.region} · MADAGASCAR
                  </span>
                  <h2>{selected.name}</h2>
                  <p className="detail-tagline">{selected.subtitle}</p>
                  <div className="detail-tabs" role="tablist" aria-label="Détails de la région">
                    <button
                      role="tab"
                      aria-selected={detailTab === 'overview'}
                      onClick={() => setDetailTab('overview')}
                      className={detailTab === 'overview' ? 'active' : ''}
                    >
                      Vue d’ensemble
                    </button>
                    <button
                      role="tab"
                      aria-selected={detailTab === 'terrain'}
                      onClick={() => setDetailTab('terrain')}
                      className={detailTab === 'terrain' ? 'active' : ''}
                    >
                      Terrain & climat
                    </button>
                  </div>
                  {detailTab === 'overview' ? (
                    <>
                      <p className="biome-description">{selected.description}</p>
                      <div className="biome-stats">
                        <div>
                          <Icon name="mountain" size={19} />
                          <small>ALTITUDE RÉELLE</small>
                          <strong>{selected.altitude}</strong>
                        </div>
                        <div>
                          <Icon name="sun" size={19} />
                          <small>CLIMAT</small>
                          <strong>{selected.climate}</strong>
                        </div>
                      </div>
                      <h3 className="tiny-heading">L’ESSENCE DE LA RÉGION</h3>
                      <div className="feature-tags">
                        {selected.features.map((f) => (
                          <span key={f}>{f}</span>
                        ))}
                      </div>
                      <div className="landmark">
                        <Icon name="pin" size={16} />
                        <div>
                          <small>NE PAS MANQUER</small>
                          <strong>{selected.landmark}</strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="terrain-details">
                      <div>
                        <span>Relief dominant</span>
                        <strong>{selected.terrain}</strong>
                      </div>
                      <div>
                        <span>Ambiance climatique</span>
                        <strong>{selected.weather}</strong>
                      </div>
                      <div>
                        <span>Matériau du sol</span>
                        <strong>
                          <i style={{ background: selected.soil }} />
                          {selected.soil}
                        </strong>
                      </div>
                      <div>
                        <span>Végétation de référence</span>
                        <strong>{selected.features[0]}</strong>
                      </div>
                      <p>
                        Altitudes de référence géographique. Le prototype 3D utilise un terrain
                        réduit et des décors procéduraux stylisés.
                      </p>
                    </div>
                  )}
                  <button className="explore-button" onClick={explore}>
                    <Icon name="compass" size={18} /> Explorer cette région{' '}
                    <Icon name="arrow" size={18} />
                  </button>
                  <p className="explore-note">
                    <i /> Exploration libre · Prototype 3D
                  </p>
                </div>
              </aside>
            </div>
            <section className="world-facts" aria-label="Madagascar en chiffres">
              <div className="fact-intro">
                <Icon name="mountain" size={29} />
                <span>
                  Bien plus qu’une île.
                  <br />
                  <strong>Un continent d’émotions.</strong>
                </span>
              </div>
              <div>
                <strong>
                  1 580 <small>km</small>
                </strong>
                <span>DU NORD AU SUD</span>
              </div>
              <div>
                <strong>
                  7 <small>biomes</small>
                </strong>
                <span>UNE DIVERSITÉ UNIQUE</span>
              </div>
              <div>
                <strong>
                  2 876 <small>m</small>
                </strong>
                <span>AU PLUS HAUT DE L’ÎLE</span>
              </div>
              <div className="fact-end">
                <span className="endemic-dot" />
                <span>
                  Une nature
                  <br />
                  <strong>extraordinairement endémique.</strong>
                </span>
              </div>
            </section>
          </main>
        ) : (
          <main className="journal-page">
            <span className="eyebrow">VOS PAS, VOTRE HISTOIRE</span>
            <h1>
              Carnet de voyage<span>.</span>
            </h1>
            <p>Les endroits qui vous appellent. Les paysages que vous avez traversés.</p>
            <div className="journal-progress">
              <Icon name="compass" size={24} />
              <div>
                <strong>{progress.visited.length} / 7 régions explorées</strong>
                <span>Chaque voyage commence par un premier pas.</span>
              </div>
              <div className="progress-track">
                <i style={{ width: `${(progress.visited.length / 7) * 100}%` }} />
              </div>
            </div>
            <h2>
              Vos étapes sauvegardées <span>{progress.saved.length}</span>
            </h2>
            {progress.saved.length ? (
              <div className="journal-grid">
                {BIOMES.filter((b) => progress.saved.includes(b.id)).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      select(b.id)
                      setTab('explore')
                    }}
                  >
                    <img src={`/images/${b.image}.jpg`} alt={b.name} />
                    <div>
                      <small>{b.region}</small>
                      <h3>{b.name}</h3>
                      <span>
                        Ouvrir la région <Icon name="arrow" size={17} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="journal-empty">
                <Icon name="book" size={42} />
                <h3>Votre carnet est une page blanche.</h3>
                <p>
                  Enregistrez une région avec le drapeau sur sa photo.
                  <br />
                  Retrouvez ici toutes vos envies d’ailleurs.
                </p>
                <button className="explore-button" onClick={() => setTab('explore')}>
                  Trouver ma première étape <Icon name="arrow" size={18} />
                </button>
              </div>
            )}
          </main>
        )}
      </div>
      <footer className="app-footer">
        <div>
          <span className="live-dot" /> MADAGASCAR OPEN WORLD <span className="footer-divider" />{' '}
          <span>Un voyage, pas une destination.</span>
        </div>
        <div>
          <button onClick={() => setSound(!sound)} aria-pressed={sound}>
            <Icon name={sound ? 'sound' : 'mute'} size={14} />
            <span>Ambiance sonore</span>
            <strong>{sound ? 'ON' : 'OFF'}</strong>
          </button>
          <span className="footer-divider" />
          <button onClick={() => setModal('help')}>
            <Icon name="info" size={14} />
            Aide & commandes
          </button>
          <span className="build-label">v0.2.0</span>
        </div>
      </footer>
      {toast && (
        <div className="app-toast" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex="-1"
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" aria-label="Fermer" onClick={() => setModal(null)}>
              <Icon name="close" />
            </button>
            <span className="modal-emblem">
              <Icon
                name={modal === 'route' ? 'compass' : modal === 'about' ? 'mountain' : 'info'}
                size={30}
              />
            </span>
            <span className="eyebrow">MADAGASCAR · THE RED ISLAND</span>
            <h2 id="modal-title">
              {modal === 'route'
                ? 'Une île, sept étapes.'
                : modal === 'about'
                  ? 'Pas une île tropicale générique.'
                  : 'Laissez-vous guider.'}
            </h2>
            {modal === 'route' ? (
              <>
                <p>
                  Une proposition de traversée pour découvrir les sept visages de Madagascar.
                  Choisissez ensuite chaque étape sur la carte pour l’explorer en 3D.
                </p>
                <ol className="route-steps">
                  {BIOMES.map((b) => (
                    <li key={b.id}>
                      <span style={{ color: b.color }}>{b.number}</span>
                      <Icon name={b.icon} size={18} />
                      <strong>{b.short}</strong>
                      <small>{b.region}</small>
                    </li>
                  ))}
                </ol>
                <p className="modal-footnote">
                  Itinéraire de découverte illustratif, pas un tracé routier ni une estimation de
                  durée réelle.
                </p>
                <button
                  className="explore-button"
                  onClick={() => {
                    setRoute(!route)
                    setModal(null)
                    setTab('explore')
                    setToast(
                      route ? 'Itinéraire masqué.' : 'Votre traversée est affichée sur la carte.',
                    )
                  }}
                >
                  {route ? 'Masquer l’itinéraire' : 'Afficher ma traversée'}
                  <Icon name="arrow" size={18} />
                </button>
              </>
            ) : modal === 'about' ? (
              <>
                <p>
                  Une île-continent rouge, une ligne de partage des eaux et sept paysages
                  profondément différents. Cet atlas est la porte d’entrée d’un monde ouvert inspiré
                  de la géographie malgache.
                </p>
                <div className="about-grid">
                  <div>
                    <strong>01 / L’atlas</strong>
                    <p>
                      Contour géographique Natural Earth. Relief illustré procédural, non issu d’un
                      relevé altimétrique.
                    </p>
                  </div>
                  <div>
                    <strong>02 / Le monde jouable</strong>
                    <p>
                      Prototype WebGL de 760 m, physique Rapier, sept zones stylisées, marche et
                      taxi-brousse.
                    </p>
                  </div>
                  <div>
                    <strong>03 / La direction artistique</strong>
                    <p>
                      Latérite, flore singulière et contrastes climatiques. Les photographies
                      d’ambiance sont générées par IA.
                    </p>
                  </div>
                </div>
                <p className="modal-footnote">
                  Un générateur de heightmap 16K est fourni hors ligne. Le terrain en streaming et
                  le raster 16K ne sont pas chargés dans le navigateur. Les lagons existent aussi au
                  sud-ouest ; jacarandas et flamboyants sont des arbres introduits, non endémiques.
                </p>
              </>
            ) : (
              <>
                <p>
                  Cliquez sur une région ou un repère pour la découvrir. Déplacez la carte en la
                  faisant glisser, et zoomez avec la molette ou les boutons + et −.
                </p>
                <div className="help-controls">
                  {[
                    ['ZQSD / WASD', 'Se déplacer'],
                    ['⇧ Maj', 'Courir'],
                    ['Espace', 'Sauter / frein à main'],
                    ['Souris', 'Orienter la caméra'],
                    ['F', 'Monter / descendre du taxi'],
                    ['R', 'Replacer le véhicule'],
                    ['H', 'Afficher les commandes'],
                    ['Échap', 'Libérer la souris'],
                  ].map(([key, action]) => (
                    <div key={key}>
                      <kbd>{key}</kbd>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
                <p className="modal-footnote">
                  La 3D se joue au clavier et à la souris. Votre carnet est enregistré localement
                  sur cet appareil. Le son d’ambiance est une synthèse de vent, et non un
                  enregistrement de faune.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
