
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

// Carte OpenStreetMap interactive via Leaflet (chargement à la demande).
// Aucun changement de dépendance npm n'est nécessaire.
type MapPoint = { lat: number; lng: number }
type LeafletMap = { setView: (point: [number, number], zoom: number) => void; fitBounds: (points: [number, number][], options?: object) => void; remove: () => void; invalidateSize: () => void }
type LeafletLine = { setLatLngs: (points: [number, number][]) => void; addTo: (map: LeafletMap) => LeafletLine }
type LeafletMarker = { setLatLng: (point: [number, number]) => void; addTo: (map: LeafletMap) => LeafletMarker }
type LeafletAPI = {
  map: (node: HTMLElement, options: object) => LeafletMap
  tileLayer: (url: string, options: object) => { addTo: (map: LeafletMap) => void }
  polyline: (points: [number, number][], options: object) => LeafletLine
  circleMarker: (point: [number, number], options: object) => LeafletMarker
}
declare global { interface Window { L?: LeafletAPI } }
let leafletPromise: Promise<LeafletAPI> | null = null
function loadLeaflet(): Promise<LeafletAPI> {
  if (window.L) return Promise.resolve(window.L)
  if (!leafletPromise) {
    leafletPromise = new Promise<LeafletAPI>((resolve, reject) => {
      if (!document.querySelector('link[data-matchfit-leaflet]')) {
        const css = document.createElement('link')
        css.rel = 'stylesheet'
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        css.dataset.matchfitLeaflet = 'true'
        document.head.appendChild(css)
      }
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.async = true
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Carte indisponible'))
      script.onerror = () => reject(new Error('Impossible de charger la carte. Vérifie ta connexion.'))
      document.head.appendChild(script)
    }).catch(error => { leafletPromise = null; throw error })
  }
  return leafletPromise
}
// Masquage d'affichage uniquement : la distance et le parcours enregistrés ne sont pas recalculés.
function distanceBetweenMeters(a: MapPoint, b: MapPoint): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
// Atténue les points GPS isolés qui créent des dents de scie, sans arrondir
// artificiellement les vrais angles. Ne modifie ni les distances ni les données stockées.
function cleanDisplayedRoute(points: MapPoint[]): MapPoint[] {
  if (points.length < 5) return points
  return points.map((point, i) => {
    if (i < 2 || i > points.length - 3) return point
    const before = points[i - 1], after = points[i + 1]
    const direct = distanceBetweenMeters(before, after)
    const detour = distanceBetweenMeters(before, point) + distanceBetweenMeters(point, after)
    // Un pic isolé : fort détour entre deux positions proches. Garder les
    // virages plausibles et les sections à grande distance entre points.
    if (direct > 35 || detour < 9 || detour < direct * 1.8) return point
    const lat = (before.lat + after.lat) / 2
    const lng = (before.lng + after.lng) / 2
    return { lat: point.lat * 0.2 + lat * 0.8, lng: point.lng * 0.2 + lng * 0.8 }
  })
}

function privacyRoute(points: MapPoint[], startMeters: number, endMeters: number, live = false): MapPoint[] {
  if (startMeters === 0 && endMeters === 0) return points
  if (points.length < 2) return []
  // Sur une activité terminée, masquer une distance parcourue le long de la trace,
  // et non un rayon autour du domicile. Ne jamais modifier les statistiques enregistrées.
  if (!live) {
    let from = 0
    let to = points.length - 1
    let distance = 0
    while (from < to && distance < startMeters) {
      distance += distanceBetweenMeters(points[from], points[from + 1])
      from++
    }
    distance = 0
    while (to > from && distance < endMeters) {
      distance += distanceBetweenMeters(points[to], points[to - 1])
      to--
    }
    return from < to ? points.slice(from, to + 1) : []
  }
  // Pendant l'enregistrement, cacher la fin de la trace sur la distance parcourue
  // (sinon la position actuelle serait visible en temps réel).
  let lastSafeIndex = points.length - 1
  if (endMeters > 0) {
    let trailingMeters = 0
    lastSafeIndex = -1
    for (let i = points.length - 1; i > 0; i--) {
      trailingMeters += distanceBetweenMeters(points[i], points[i - 1])
      if (trailingMeters >= endMeters) { lastSafeIndex = i - 1; break }
    }
  }
  if (lastSafeIndex < 0) return []
  let from = 0
  let leadingMeters = 0
  while (from < lastSafeIndex && leadingMeters < startMeters) {
    leadingMeters += distanceBetweenMeters(points[from], points[from + 1])
    from++
  }
  return from < lastSafeIndex ? points.slice(from, lastSafeIndex + 1) : []
}
function PrivacyDistanceControls({ startMeters, endMeters, setStartMeters, setEndMeters }: {
  startMeters: number; endMeters: number;
  setStartMeters: (meters: number) => void; setEndMeters: (meters: number) => void
}) {
  return <div style={{ marginTop: 12, display: 'grid', gap: 12, padding: 12, border: '1px solid #343541', borderRadius: 12 }}>
    <strong style={{ fontSize: 13 }}>Confidentialité du parcours</strong>
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span>Masquer le départ : <strong>{startMeters} m</strong></span>
      <input type="range" min={0} max={1000} step={50} value={startMeters}
        onChange={event => setStartMeters(Number(event.target.value))} aria-label="Distance masquée au départ" />
      <span style={{ display: 'flex', justifyContent: 'space-between', color: '#a4a4ad', fontSize: 11 }}><span>0 m</span><span>1 km</span></span>
    </label>
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span>Masquer l’arrivée : <strong>{endMeters} m</strong></span>
      <input type="range" min={0} max={1000} step={50} value={endMeters}
        onChange={event => setEndMeters(Number(event.target.value))} aria-label="Distance masquée à l'arrivée" />
      <span style={{ display: 'flex', justifyContent: 'space-between', color: '#a4a4ad', fontSize: 11 }}><span>0 m</span><span>1 km</span></span>
    </label>
    <span style={{ color: '#a4a4ad', fontSize: 11 }}>0 m = aucun masquage. La distance totale reste inchangée. Les points masqués ne seront pas publiés.</span>
  </div>
}
function ActivityMap({ points = [], follow = false, height = 290 }: { points?: MapPoint[]; follow?: boolean; height?: number }) {
  const element = useRef<HTMLDivElement | null>(null)
  const map = useRef<LeafletMap | null>(null)
  const line = useRef<LeafletLine | null>(null)
  const marker = useRef<LeafletMarker | null>(null)
  const latestPoints = useRef(points)
  latestPoints.current = points
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void loadLeaflet().then(L => {
      if (cancelled || !element.current) return
      const instance = L.map(element.current, { zoomControl: true, scrollWheelZoom: false })
      map.current = instance
      instance.setView([25, 0], 2)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
      }).addTo(instance)
      line.current = L.polyline([], { color: '#ff8a4b', weight: 5, opacity: 0.95 }).addTo(instance)
      if (latestPoints.current.length) {
        const coords = cleanDisplayedRoute(latestPoints.current).map(point => [point.lat, point.lng] as [number, number])
        line.current.setLatLngs(coords)
        instance.fitBounds(coords, { padding: [24, 24], maxZoom: 16 })
      }
      setTimeout(() => { if (!cancelled) instance.invalidateSize() }, 100)
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Carte indisponible') })
    return () => { cancelled = true; map.current?.remove(); map.current = null; line.current = null; marker.current = null }
  }, [])
  useEffect(() => {
    if (!map.current || !line.current || !window.L || !points.length) return
    const coords = cleanDisplayedRoute(points).map(point => [point.lat, point.lng] as [number, number])
    line.current.setLatLngs(coords)
    const last = coords[coords.length - 1]
    if (!marker.current) marker.current = window.L.circleMarker(last, { radius: 7, color: '#fff', weight: 2, fillColor: '#ff8a4b', fillOpacity: 1 }).addTo(map.current)
    else marker.current.setLatLng(last)
    if (follow) map.current.setView(last, 17)
    else map.current.fitBounds(coords, { padding: [24, 24], maxZoom: 16 })
  }, [points, follow])
  return <div style={{ marginBottom: 16 }}>
    <div ref={element} style={{ height, width: '100%', background: '#252832', borderRadius: 14, overflow: 'hidden', position: 'relative', isolation: 'isolate', zIndex: 0 }} aria-label="Carte mondiale interactive OpenStreetMap" />
    {error && <p role="alert" style={{ color: '#ff7777', fontSize: 12 }}>{error}</p>}
  </div>
}

function ActivityShare({ activity, startMeters, endMeters }: { activity: Activity; startMeters: number; endMeters: number }) {
  const [showOptions, setShowOptions] = useState(false)
  const [includeElevation, setIncludeElevation] = useState(false)
  const [includePace, setIncludePace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function copyActivity() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      // PNG transparent : à coller par-dessus une photo dans Instagram.
      // Préparer l'image directement dans le gestionnaire de clic pour préserver
      // autant que possible l'autorisation du presse-papiers sur iOS.
      const canvas = document.createElement('canvas')
      const width = 1080
      const height = 1250
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Image indisponible sur cet appareil.')
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(0,0,0,.85)'
      ctx.shadowBlur = 14
      ctx.font = 'bold 55px Arial, sans-serif'
      ctx.fillText('MATCHFIT', width / 2, 110)
      ctx.font = 'bold 32px Arial, sans-serif'
      ctx.fillText(activity.sport.toUpperCase(), width / 2, 166)
      // Composition : en-tête, parcours orange, puis statistiques en dessous.
      const seconds = activity.duration_seconds
      const totalMinutes = Math.floor(seconds / 60)
      const duration = totalMinutes < 60 ? `${totalMinutes} minutes` : `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, '0')}`
      const route = cleanDisplayedRoute(privacyRoute(activity.route ?? [], startMeters, endMeters))
      if (route.length > 1) {
        const lats = route.map(p => p.lat)
        const lngs = route.map(p => p.lng)
        const latMid = (Math.min(...lats) + Math.max(...lats)) / 2
        const cos = Math.max(.01, Math.cos(latMid * Math.PI / 180))
        const coords = route.map(p => ({ x: p.lng * cos, y: p.lat }))
        const xs = coords.map(p => p.x), ys = coords.map(p => p.y)
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        const scale = Math.min(820 / Math.max(maxX - minX, 1e-8), 460 / Math.max(maxY - minY, 1e-8))
        const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2
        ctx.beginPath()
        coords.forEach((point, index) => {
          const x = width / 2 + (point.x - centerX) * scale
          const y = 470 - (point.y - centerY) * scale
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.shadowBlur = 8
        ctx.strokeStyle = '#ff8a4b'
        ctx.lineWidth = 12
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // Les chiffres se trouvent SOUS le parcours, jamais au-dessus.
      ctx.shadowBlur = 14
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 95px Arial, sans-serif'
      ctx.fillText(activity.distance_km === null ? '—' : `${activity.distance_km.toFixed(2).replace('.', ',')} km`, width / 2, 865)
      ctx.font = 'bold 68px Arial, sans-serif'
      ctx.fillText(duration, width / 2, 950)
      let statY = 1030
      if (includePace && activity.distance_km !== null && activity.distance_km > 0 && seconds > 0) {
        const isBike = /vélo|velo|cyclisme|vtt|bike|cycling|bicyclette/i.test(activity.sport)
        const paceOrSpeed = isBike
          ? `${(activity.distance_km * 3600 / seconds).toFixed(1).replace('.', ',')} km/h`
          : (() => {
              const pace = Math.round(seconds / activity.distance_km!)
              return `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')} /km`
            })()
        ctx.font = 'bold 53px Arial, sans-serif'
        ctx.fillText(paceOrSpeed, width / 2, statY)
        statY += 72
      }
      if (includeElevation && activity.elevation_m !== null) {
        ctx.font = 'bold 49px Arial, sans-serif'
        ctx.fillText(`D+ ${Math.round(activity.elevation_m)} m`, width / 2, statY)
      }

      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Copie d’image non disponible sur cet appareil. Le partage natif iOS nécessitera une adaptation.')
      }
      // Fournir une promesse de Blob à ClipboardItem permet aux navigateurs
      // qui l'exigent de recevoir l'autorisation dès le clic utilisateur.
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image non générée.')), 'image/png')
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
      setMessage('Image copiée ! Tu peux essayer de la coller dans Instagram.')
      setShowOptions(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Copie impossible sur cet appareil.')
    } finally {
      setBusy(false)
    }
  }

  return <div style={{ position: 'relative', flexShrink: 0 }}>
    <button type="button" onClick={() => setShowOptions(value => !value)}
      aria-label="Partager l’activité" title="Partager" aria-expanded={showOptions}
      style={{ border: 0, background: 'transparent', color: '#d4d4dc', padding: '6px 8px', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
      ↗
    </button>
    {showOptions && <div style={{ position: 'absolute', right: 0, top: '100%', width: 'min(290px, 78vw)', zIndex: 100, display: 'grid', gap: 12, padding: 14, borderRadius: 12, border: '1px solid #343541', background: '#202129', boxShadow: '0 12px 32px rgba(0,0,0,.45)', fontSize: 13 }}>
      <button type="button" onClick={() => setShowOptions(false)} aria-label="Fermer les options de partage" title="Fermer"
        style={{ justifySelf: 'end', border: 0, background: 'transparent', color: '#d4d4dc', padding: '0 2px', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>
        ×
      </button>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={includePace} onChange={event => setIncludePace(event.target.checked)} />
        Ajouter l’allure
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={includeElevation} onChange={event => setIncludeElevation(event.target.checked)} />
        Ajouter le dénivelé
      </label>
      <button type="button" disabled={busy} onClick={() => void copyActivity()}
        style={{ justifySelf: 'stretch', border: '1px solid #444550', borderRadius: 8, background: 'transparent', color: '#fff', padding: '10px 12px', fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Copie…' : 'Confirmer'}
      </button>
    </div>}
    {message && <p role="status" style={{ position: 'absolute', right: 0, top: showOptions ? 220 : 35, width: 250, zIndex: 101, background: '#202129', padding: 8, borderRadius: 8, color: '#a4a4ad', fontSize: 12, margin: 0 }}>{message}</p>}
  </div>
}

function ModernHeart({ filled, size = 26 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  )
}

type Page = 'accueil' | 'decouvrir' | 'activites' | 'messages' | 'profil' | 'reglages'
type Activity = { id: string; user_id: string; sport: string; title: string; started_at: string; duration_seconds: number; distance_km: number | null; elevation_m: number | null; notes: string; source: 'manual' | 'gps'; route: { lat: number; lng: number }[] | null; created_at: string }
type CreationType = 'story' | 'publication'
type AuthMode = 'connexion' | 'inscription' | 'oubli'

type SocialPost = {
  id: string
  user_id: string
  caption: string
  media_url: string
  media_type: 'image' | 'video'
  created_at: string
  hide_like_count: boolean
  comments_disabled: boolean
}

// Publications fictives pour illustrer Découvrir, sans écriture dans Supabase.
// Activités fictives pour tester la carte et le partage sans enregistrer de GPS.
// Coordonnées inventées : elles ne représentent pas un trajet réellement parcouru.
function makeDemoRoute(centerLat: number, centerLng: number, latRadius: number, lngRadius: number, phase: number): MapPoint[] {
  return Array.from({ length: 91 }, (_, index) => {
    const angle = (index / 90) * Math.PI * 2
    const wobble = 1 + 0.13 * Math.sin(3 * angle + phase) + 0.08 * Math.cos(5 * angle - phase)
    return {
      lat: centerLat + Math.sin(angle) * latRadius * wobble,
      lng: centerLng + Math.cos(angle) * lngRadius * wobble
    }
  })
}

const demoActivities: Activity[] = [
  { id: 'demo-running', user_id: 'demo', sport: 'Course à pied', title: 'Running du matin', started_at: '2026-11-14T08:15:00', duration_seconds: 2700, distance_km: 6.8, elevation_m: 85, notes: '', source: 'gps', route: makeDemoRoute(46.518, 6.632, 0.012, 0.021, 0.3), created_at: '2026-11-14T08:15:00' },
  { id: 'demo-trail', user_id: 'demo', sport: 'Trail', title: 'Sortie en montagne', started_at: '2026-11-13T09:20:00', duration_seconds: 7260, distance_km: 16.8, elevation_m: 780, notes: '', source: 'gps', route: makeDemoRoute(46.352, 7.159, 0.028, 0.042, 1.4), created_at: '2026-11-13T09:20:00' },
  { id: 'demo-velo', user_id: 'demo', sport: 'Vélo', title: 'Boucle du dimanche', started_at: '2026-11-08T10:00:00', duration_seconds: 5400, distance_km: 34.6, elevation_m: 420, notes: '', source: 'gps', route: makeDemoRoute(46.47, 6.72, 0.04, 0.075, 2.1), created_at: '2026-11-08T10:00:00' },
  { id: 'demo-rando', user_id: 'demo', sport: 'Randonnée', title: 'Randonnée panoramique', started_at: '2026-11-07T09:00:00', duration_seconds: 9600, distance_km: 11.2, elevation_m: 610, notes: '', source: 'gps', route: makeDemoRoute(46.34, 7.19, 0.018, 0.027, 3.0), created_at: '2026-11-07T09:00:00' },
  { id: 'demo-trail-vertical', user_id: 'demo', sport: 'Trail', title: 'Montée des sommets', started_at: '2026-11-06T07:30:00', duration_seconds: 4680, distance_km: 9.4, elevation_m: 1120, notes: '', source: 'gps', route: makeDemoRoute(46.329, 7.202, 0.015, 0.019, 2.7), created_at: '2026-11-06T07:30:00' },
  { id: 'demo-marche', user_id: 'demo', sport: 'Marche', title: 'Balade vallonnée', started_at: '2026-11-05T10:00:00', duration_seconds: 3480, distance_km: 4.8, elevation_m: 160, notes: '', source: 'gps', route: makeDemoRoute(46.51, 6.61, 0.008, 0.012, 0.8), created_at: '2026-11-05T10:00:00' }
]

const discoverDemos: SocialPost[] = [
  { id: 'discover-demo-emma', user_id: 'discover-demo-emma', caption: 'Emma · Running — Sortie matinale 🏃‍♀️', media_url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
  { id: 'discover-demo-lucas', user_id: 'discover-demo-lucas', caption: 'Lucas · Musculation — Séance du jour 💪', media_url: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
  { id: 'discover-demo-clara', user_id: 'discover-demo-clara', caption: 'Clara · Fitness — Toujours motivée 🔥', media_url: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
  { id: 'discover-demo-trail', user_id: 'discover-demo-trail', caption: 'Noah · Trail — Prendre de la hauteur ⛰️', media_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
  { id: 'discover-demo-yoga', user_id: 'discover-demo-yoga', caption: 'Lina · Yoga — Un moment pour soi 🧘', media_url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
  { id: 'discover-demo-course', user_id: 'discover-demo-course', caption: 'Alex · Course — Objectif atteint 🏅', media_url: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=900&auto=format&fit=crop&q=80', media_type: 'image', created_at: '2026-11-13', hide_like_count: false, comments_disabled: false },
]

type StoredComment = { id: string; post_id: string; user_id: string; content: string; created_at: string; parent_id: string | null }
type DisplayComment = { id: string; name: string; text: string; demo: boolean; parentId: string | null }

type PostAuthor = {
  first_name: string
  username: string | null
  avatar_url: string | null
}


type SocialProfile = {
  user_id: string
  first_name: string
  username: string | null
  city: string
  sports: string[]
  bio: string
  avatar_url: string | null
  is_private: boolean
}

const emptyProfile = (userId: string): SocialProfile => ({
  user_id: userId,
  first_name: '',
  username: null,
  city: '',
  sports: [],
  bio: '',
  avatar_url: null,
  is_private: false
})

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 14,
  borderRadius: 12,
  border: '1px solid #30313b',
  background: '#24252e',
  color: '#fff',
  fontSize: 14,
  marginTop: 7,
  marginBottom: 16
}

const primaryStyle: CSSProperties = {
  width: '100%',
  padding: 15,
  border: 'none',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #ff6558, #ff8a4b)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer'
}

const linkStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ff8a4b',
  padding: 10,
  fontSize: 13,
  cursor: 'pointer'
}

const cardStyle: CSSProperties = {
  marginTop: 20,
  padding: 20,
  borderRadius: 18,
  background: '#17181f',
  border: '1px solid #30313b'
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 002.8 2.8" />
          <path d="M9.9 5.3A10.8 10.8 0 0112 5c5 0 9 4 10 7a12.6 12.6 0 01-3.2 4.5" />
          <path d="M6.3 6.3C4.2 7.7 2.7 9.8 2 12c1 3 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

function useStableIphoneViewport() {
  useEffect(() => {
    let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!viewport) {
      viewport = document.createElement('meta')
      viewport.name = 'viewport'
      document.head.appendChild(viewport)
    }
    viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    const style = document.createElement('style')
    style.dataset.matchfitViewportFix = 'true'
    style.textContent = `
      html, body, #root { width: 100%; max-width: 100%; min-width: 0; margin: 0; overflow-x: clip; }
      html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
      #root, #root > .app { box-sizing: border-box; max-width: 100%; min-width: 0; }
      #root *, #root *::before, #root *::after { box-sizing: border-box; }
      #root img, #root video, #root canvas { max-width: 100%; }
      input, textarea, select { font-size: max(16px, 1em); }
      .leaflet-container { max-width: 100%; touch-action: pan-x pan-y; }
    `
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])
}

function App() {
  useStableIphoneViewport()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('connexion')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [showLoginSuggestion, setShowLoginSuggestion] = useState(false)

  const [page, setPage] = useState<Page>('accueil')
  const [settingsSection, setSettingsSection] = useState<'accueil' | 'archives' | 'confidentialite' | 'securite' | 'conditions' | 'donnees'>('accueil')
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({})
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>({})
  const [postLikeCounts, setPostLikeCounts] = useState<Record<string, number>>({})
  const [commentLikeCounts, setCommentLikeCounts] = useState<Record<string, number>>({})
  const [storedComments, setStoredComments] = useState<Record<string, StoredComment[]>>({})
  const [commentAuthors, setCommentAuthors] = useState<Record<string, string>>({})
  const [interactionBusy, setInteractionBusy] = useState<Record<string, boolean>>({})
  const [postMenu, setPostMenu] = useState<string | null>(null)
  const [reportPost, setReportPost] = useState<{ id: string; author: string; demo: boolean } | null>(null)
  const [reportReason, setReportReason] = useState('Spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [comments, setComments] = useState<Record<string, string[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [replyTo, setReplyTo] = useState<{ postId: string; commentId: string; username: string } | null>(null)
  const [demoReplies, setDemoReplies] = useState<Record<string, DisplayComment[]>>({})
  const [commentModal, setCommentModal] = useState<{ id: string; author: string; caption: string } | null>(null)
  const [interactionMessage, setInteractionMessage] = useState('')
  const [creationOpen, setCreationOpen] = useState(false)
  const [creationType, setCreationType] = useState<CreationType | null>(null)
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [authors, setAuthors] = useState<Record<string, PostAuthor>>({})
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsError, setPostsError] = useState('')
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [postFile, setPostFile] = useState<File | null>(null)
  const [postCaption, setPostCaption] = useState('')
  const [hideLikeCount, setHideLikeCount] = useState(false)
  const [commentsDisabled, setCommentsDisabled] = useState(false)
  const [postSettingsBusy, setPostSettingsBusy] = useState(false)
  const [postSettingsError, setPostSettingsError] = useState('')
  const [postPreview, setPostPreview] = useState<string | null>(null)

  const [profile, setProfile] = useState<SocialProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [sportsText, setSportsText] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [reelsMode, setReelsMode] = useState(false)
  const reelsContainerRef = useRef<HTMLDivElement | null>(null)
  const [ownPostMenuOpen, setOwnPostMenuOpen] = useState<string | null>(null)
  const [viewedProfile, setViewedProfile] = useState<SocialProfile | null>(null)
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false)
  const [viewedProfileError, setViewedProfileError] = useState('')
  const [following, setFollowing] = useState(false)
  const [followRequested, setFollowRequested] = useState(false)
  const [followRequests, setFollowRequests] = useState<{ follower_id: string; username: string }[]>([])
  const [privacyByUser, setPrivacyByUser] = useState<Record<string, boolean>>({})
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [discoverPeople, setDiscoverPeople] = useState<SocialProfile[]>([])
  const [discoverPeopleError, setDiscoverPeopleError] = useState('')
  const [followBusy, setFollowBusy] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityMode, setActivityMode] = useState<'list' | 'manual' | 'choose' | 'gps' | 'preview'>('list')
  const [activitySport, setActivitySport] = useState('Course à pied')
  const [activityTitle, setActivityTitle] = useState('')
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10))
  const [activityMinutes, setActivityMinutes] = useState('')
  const [activityDistance, setActivityDistance] = useState('')
  const [activityElevation, setActivityElevation] = useState('')
  const [activityNotes, setActivityNotes] = useState('')
  const [activitySaving, setActivitySaving] = useState(false)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'running' | 'paused'>('idle')
  const [hideStartMeters, setHideStartMeters] = useState(200)
  const [hideEndMeters, setHideEndMeters] = useState(200)
  const [hidePace, setHidePace] = useState(false)
  const [gpsPoints, setGpsPoints] = useState<{ lat: number; lng: number }[]>([])
  const [gpsSeconds, setGpsSeconds] = useState(0)
  const [gpsDistance, setGpsDistance] = useState(0)
  const [gpsElevation, setGpsElevation] = useState(0)
  const [gpsAltitudeSamples, setGpsAltitudeSamples] = useState(0)
  const gpsLastAltitude = useRef<number | null>(null)
  const gpsLastPoint = useRef<{ lat: number; lng: number; timestamp: number } | null>(null)
  const gpsDistanceRef = useRef(0)
  const gpsElevationRef = useRef(0)
  const gpsAltitudeSamplesRef = useRef(0)
  const gpsPointsRef = useRef<MapPoint[]>([])
  const nativeWatcherId = useRef<string | null>(null)
  const gpsRunStartedAt = useRef<number | null>(null)
  const gpsElapsedMs = useRef(0)
  const gpsSessionStartedAt = useRef<string | null>(null)
  const gpsStatusRef = useRef<'idle' | 'running' | 'paused'>('idle')
  const nativeGps = Capacitor.isNativePlatform()
  const [gpsStarting, setGpsStarting] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [gpsPreviewPosition, setGpsPreviewPosition] = useState<MapPoint | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [gpsCurrentAltitude, setGpsCurrentAltitude] = useState<number | null>(null)


  // À chaque changement de page ou ouverture d'un écran, repartir du haut.
  // Cela inclut les pages principales, les réglages, les profils et les publications.
  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      const app = document.querySelector<HTMLElement>('#root > .app')
      if (app) app.scrollTop = 0
      const publication = document.querySelector<HTMLElement>('[aria-label="Publication en grand"]')
      if (publication) publication.scrollTop = 0
      const memberProfile = document.querySelector<HTMLElement>('[aria-label="Profil du membre"]')
      if (memberProfile) memberProfile.scrollTop = 0
    }
    resetScroll()
    const frame = window.requestAnimationFrame(resetScroll)
    return () => window.cancelAnimationFrame(frame)
  }, [page, settingsSection, selectedPost?.id, viewedProfile?.user_id])


  useEffect(() => {
    let active = true

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        setSession(data.session)
        if (error) setAuthError(error.message)
        setAuthLoading(false)
      })
      .catch(() => {
        if (!active) return
        setAuthError('Impossible de vérifier la connexion.')
        setAuthLoading(false)
      })

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return
        setSession(nextSession)
        setAuthLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user.id

    if (!userId) {
      setProfile(null)
      setProfileEditing(false)
      setAvatarFile(null)
      setAvatarPreview(null)
      return
    }

    let cancelled = false

    async function loadProfile() {
      setProfileLoading(true)
      setProfileError('')
      setProfileMessage('')

      try {
        const { data, error } = await supabase
          .from('social_profiles')
          .select(
            'user_id, first_name, username, city, sports, bio, avatar_url, is_private'
          )
          .eq('user_id', userId)
          .maybeSingle()

        if (cancelled) return
        if (error) throw error

        const loaded =
          (data as SocialProfile | null) ?? emptyProfile(userId!)

        setProfile(loaded)
        setSportsText(loaded.sports.join(', '))
        setProfileEditing(false)
      } catch (error) {
        if (cancelled) return

        setProfileError(
          error instanceof Error
            ? 'Impossible de charger ton profil : ' + error.message
            : 'Impossible de charger ton profil.'
        )
        setProfile(emptyProfile(userId!))
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null)
      return
    }

    const url = URL.createObjectURL(avatarFile)
    setAvatarPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  useEffect(() => {
    if (!session?.user.id) {
      setPosts([])
      setAuthors({})
      return
    }
    void loadPosts()
  }, [session?.user.id])

  useEffect(() => {
    if (!postFile) {
      setPostPreview(null)
      return
    }
    const url = URL.createObjectURL(postFile)
    setPostPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [postFile])

  async function loadPosts() {
    setPostsLoading(true)
    setPostsError('')
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select('id, user_id, caption, media_url, media_type, created_at, hide_like_count, comments_disabled')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const nextPosts = (data ?? []) as SocialPost[]
      setPosts(nextPosts)
      await loadInteractions(nextPosts)

      const userIds = [...new Set(nextPosts.map(post => post.user_id))]
      if (userIds.length) {
        const { data: people, error: peopleError } = await supabase
          .from('social_profiles')
          .select('user_id, first_name, username, avatar_url, is_private')
          .in('user_id', userIds)
        if (peopleError) throw peopleError
        const nextAuthors: Record<string, PostAuthor> = {}
        for (const person of people ?? []) {
          nextAuthors[person.user_id] = {
            first_name: person.first_name,
            username: person.username,
            avatar_url: person.avatar_url
          }
        }
        setAuthors(nextAuthors)
        setPrivacyByUser(Object.fromEntries((people ?? []).map(person => [person.user_id, !!person.is_private])))
      } else {
        setAuthors({})
        setPrivacyByUser({})
      }
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : 'Chargement impossible.')
    } finally {
      setPostsLoading(false)
    }
  }

  useEffect(() => {
    if (!session?.user.id || page !== 'decouvrir') return
    let cancelled = false
    async function loadDiscoverPeople() {
      const { data, error } = await supabase.from('social_profiles')
        .select('user_id, first_name, username, city, sports, bio, avatar_url, is_private')
        .order('first_name', { ascending: true }).limit(300)
      if (cancelled) return
      if (error) setDiscoverPeopleError('Recherche indisponible : ' + error.message)
      else { setDiscoverPeople((data ?? []) as SocialProfile[]); setDiscoverPeopleError('') }
    }
    void loadDiscoverPeople()
    return () => { cancelled = true }
  }, [session?.user.id, page])

  const normalizedDiscoverSearch = discoverSearch.trim().toLocaleLowerCase('fr')
  const matchesDiscover = (person: SocialProfile) => {
    const textMatches = !normalizedDiscoverSearch || [person.first_name, person.username || '', person.city, ...(person.sports || [])]
      .some(value => value.toLocaleLowerCase('fr').includes(normalizedDiscoverSearch))
    return textMatches
  }
  const discoverMatches = discoverPeople.filter(person => person.user_id !== session?.user.id && matchesDiscover(person))
  const discoverVisiblePosts = posts.filter(post =>
    post.user_id !== session?.user.id && privacyByUser[post.user_id] === false
  )


  useEffect(() => {
    if (!session?.user.id || (page !== 'activites' && page !== 'profil')) return
    let cancelled = false
    async function fetchActivities() {
      setActivityLoading(true)
      const { data, error } = await supabase.from('social_activities').select('*').eq('user_id', session!.user.id).order('started_at', { ascending: false }).limit(100)
      if (!cancelled) {
        setActivities((data ?? []) as Activity[])
        setActivityError(error ? 'Historique indisponible : ' + error.message : '')
        setActivityLoading(false)
      }
    }
    void fetchActivities()
    return () => { cancelled = true }
  }, [session?.user.id, page])

  // Obtenir la position dès l'ouverture de l'enregistreur, après le choix du sport.
  // Cette position sert uniquement à centrer la carte : aucun point n'est enregistré
  // et aucun kilomètre n'est comptabilisé avant le bouton Démarrer.
  useEffect(() => {
    if (activityMode !== 'gps' || !navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(position => {
      if (cancelled) return
      setGpsPreviewPosition({ lat: position.coords.latitude, lng: position.coords.longitude })
      setGpsAccuracy(position.coords.accuracy)
      setGpsCurrentAltitude(position.coords.altitude !== null && Number.isFinite(position.coords.altitude) ? position.coords.altitude : null)
      setGpsError('')
    }, error => {
      if (!cancelled) setGpsError('Localisation : ' + error.message)
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 })
    return () => { cancelled = true }
  }, [activityMode])

  // Horloge fondée sur les timestamps : reste correcte après suspension de l'interface iOS.
  useEffect(() => {
    if (gpsStatus !== 'running') return
    const update = () => setGpsSeconds(Math.floor((gpsElapsedMs.current + (gpsRunStartedAt.current === null ? 0 : Date.now() - gpsRunStartedAt.current)) / 1000))
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [gpsStatus])

  function acceptGpsPosition(latitude: number, longitude: number, accuracy: number, altitude: number | null, altitudeAccuracy: number | null, timestamp: number) {
    if (gpsStatusRef.current !== 'running') return
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return
    setGpsAccuracy(accuracy)
    if (altitude !== null && Number.isFinite(altitude)) setGpsCurrentAltitude(altitude)
    if (accuracy > 25 || accuracy <= 0) return
    const next = { lat: latitude, lng: longitude }
    const last = gpsLastPoint.current
    if (last) {
      const rad = Math.PI / 180
      const dLat = (latitude - last.lat) * rad
      const dLng = (longitude - last.lng) * rad
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(last.lat * rad) * Math.cos(latitude * rad) * Math.sin(dLng / 2) ** 2
      const meters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
      const seconds = Math.max(0.1, (timestamp - last.timestamp) / 1000)
      // Écarter les oscillations GPS et les déplacements manifestement impossibles.
      if (meters < Math.max(3, Math.min(accuracy * 0.35, 8))) return
      if (meters / seconds > 35 || meters > 300) return
      gpsDistanceRef.current += meters / 1000
      setGpsDistance(gpsDistanceRef.current)
    }
    gpsLastPoint.current = { ...next, timestamp }
    gpsPointsRef.current = [...gpsPointsRef.current, next]
    setGpsPoints(gpsPointsRef.current)
    if (altitude !== null && Number.isFinite(altitude) && altitudeAccuracy !== null && Number.isFinite(altitudeAccuracy) && altitudeAccuracy > 0 && altitudeAccuracy <= 15) {
      const previous = gpsLastAltitude.current
      if (previous === null) {
        gpsLastAltitude.current = altitude
        gpsAltitudeSamplesRef.current += 1
      } else {
        const difference = altitude - previous
        if (Math.abs(difference) >= 3 && Math.abs(difference) <= 30) {
          if (difference > 0) gpsElevationRef.current += difference
          gpsLastAltitude.current = altitude
          gpsAltitudeSamplesRef.current += 1
        }
      }
      setGpsElevation(gpsElevationRef.current)
      setGpsAltitudeSamples(gpsAltitudeSamplesRef.current)
    }
    setGpsError('')
  }

  // Safari conserve le suivi web pour les essais ; sur iOS natif on utilise le plugin.
  useEffect(() => {
    if (nativeGps || gpsStatus !== 'running' || !navigator.geolocation) return
    const watch = navigator.geolocation.watchPosition(position => {
      const c = position.coords
      acceptGpsPosition(c.latitude, c.longitude, c.accuracy, c.altitude, c.altitudeAccuracy, position.timestamp)
    }, error => setGpsError('Localisation : ' + error.message), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    return () => navigator.geolocation.clearWatch(watch)
  }, [gpsStatus])

  async function stopNativeGps() {
    const id = nativeWatcherId.current
    nativeWatcherId.current = null
    if (id !== null) {
      try { await BackgroundGeolocation.removeWatcher({ id }) }
      catch (error) { console.warn('Arrêt GPS natif :', error) }
    }
  }

  async function toggleGpsRecording() {
    if (gpsStarting) return
    setGpsStarting(true)
    setGpsError('')
    try {
      if (gpsStatusRef.current === 'running') {
        gpsElapsedMs.current += gpsRunStartedAt.current === null ? 0 : Date.now() - gpsRunStartedAt.current
        gpsRunStartedAt.current = null
        gpsStatusRef.current = 'paused'
        setGpsStatus('paused')
        // Une pause coupe réellement la géolocalisation native et web.
        if (nativeGps) await stopNativeGps()
        setGpsSeconds(Math.floor(gpsElapsedMs.current / 1000))
        gpsLastPoint.current = null
        gpsLastAltitude.current = null
        return
      }
      const fresh = gpsStatusRef.current === 'idle'
      if (nativeGps) {
        // iOS affiche sa demande de permission et peut refuser le suivi en arrière-plan.
        const id = await BackgroundGeolocation.addWatcher({
          backgroundMessage: 'MatchFit enregistre ton activité sportive même lorsque ton écran est verrouillé.',
          backgroundTitle: 'Activité MatchFit en cours',
          requestPermissions: true,
          stale: false,
          distanceFilter: 5
        }, (location, error) => {
          if (error) {
            setGpsError('GPS natif : ' + (error.message || 'Localisation indisponible. Vérifie les autorisations iOS.'))
            return
          }
          if (!location) return
          acceptGpsPosition(location.latitude, location.longitude, location.accuracy, location.altitude ?? null, location.altitudeAccuracy ?? null, typeof location.time === 'number' ? location.time : Date.now())
        })
        nativeWatcherId.current = id
      } else if (!navigator.geolocation) {
        throw new Error('GPS indisponible sur cet appareil.')
      }
      if (fresh) {
        gpsPointsRef.current = []; gpsDistanceRef.current = 0; gpsElevationRef.current = 0; gpsAltitudeSamplesRef.current = 0
        gpsLastPoint.current = null; gpsLastAltitude.current = null
        gpsElapsedMs.current = 0; gpsSessionStartedAt.current = new Date().toISOString()
        setGpsPoints([]); setGpsDistance(0); setGpsSeconds(0); setGpsElevation(0); setGpsAltitudeSamples(0)
      }
      gpsRunStartedAt.current = Date.now()
      gpsStatusRef.current = 'running'
      setGpsStatus('running')
    } catch (error) {
      setGpsError(error instanceof Error ? error.message : 'Impossible de démarrer le GPS.')
      await stopNativeGps()
    } finally { setGpsStarting(false) }
  }

  // Évite de laisser un watcher actif après démontage du composant.
  useEffect(() => () => { void stopNativeGps() }, [])

  async function saveActivity(source: 'manual' | 'gps') {
    if (!session || activitySaving) return
    const seconds = source === 'gps' ? Math.floor((gpsElapsedMs.current + (gpsRunStartedAt.current === null ? 0 : Date.now() - gpsRunStartedAt.current)) / 1000) : Math.round(Number(activityMinutes) * 60)
    const distance = source === 'gps' ? gpsDistanceRef.current : activityDistance.trim() ? Number(activityDistance.replace(',', '.')) : null
    const elevation = source === 'gps' ? (gpsAltitudeSamplesRef.current >= 2 ? Math.round(gpsElevationRef.current) : null) : activityElevation.trim() ? Number(activityElevation.replace(',', '.')) : null
    if (!Number.isFinite(seconds) || seconds <= 0 || (distance !== null && (!Number.isFinite(distance) || distance < 0)) || (elevation !== null && (!Number.isFinite(elevation) || elevation < 0))) {
      setActivityError('Vérifie la durée, la distance et le dénivelé.'); return
    }
    setActivitySaving(true); setActivityError('')
    const payload = { user_id: session.user.id, sport: activitySport, title: activityTitle.trim() || 'Ma séance du jour', started_at: source === 'gps' ? (gpsSessionStartedAt.current || new Date().toISOString()) : new Date(activityDate + 'T12:00:00').toISOString(), duration_seconds: seconds, distance_km: distance, elevation_m: elevation, notes: activityNotes.trim(), source, route: source === 'gps' ? privacyRoute(gpsPointsRef.current, hideStartMeters, hideEndMeters) : null }
    const { data, error } = await supabase.from('social_activities').insert(payload).select('*').single()
    setActivitySaving(false)
    if (error) { setActivityError('Enregistrement impossible : ' + error.message); return }
    if (source === 'gps') { gpsStatusRef.current = 'idle'; await stopNativeGps() }
    setActivities(current => [data as Activity, ...current])
    setActivityMode('list'); setGpsStatus('idle'); setGpsPoints([]); setGpsDistance(0); setGpsSeconds(0); setGpsElevation(0); setGpsAltitudeSamples(0); setGpsAccuracy(null); setGpsCurrentAltitude(null); gpsLastAltitude.current = null; gpsLastPoint.current = null; gpsRunStartedAt.current = null; gpsElapsedMs.current = 0; gpsSessionStartedAt.current = null; gpsPointsRef.current = []; gpsDistanceRef.current = 0; gpsElevationRef.current = 0; gpsAltitudeSamplesRef.current = 0
    setActivityTitle(''); setActivityMinutes(''); setActivityDistance(''); setActivityElevation(''); setActivityNotes(''); setHideStartMeters(200); setHideEndMeters(200); setHidePace(false)
  }

  async function deleteActivity(activity: Activity) {
    if (!session || deletingActivityId || !window.confirm(`Supprimer définitivement « ${activity.title} » ?`)) return
    setDeletingActivityId(activity.id)
    setActivityError('')
    try {
      const { error } = await supabase.from('social_activities').delete().eq('id', activity.id).eq('user_id', session.user.id)
      if (error) throw error
      setActivities(current => current.filter(item => item.id !== activity.id))
    } catch (error) {
      setActivityError(error instanceof Error ? `Suppression impossible : ${error.message}` : 'Suppression impossible.')
    } finally { setDeletingActivityId(null) }
  }

  // Compter uniquement les activités GPS réellement enregistrées, sans les démos.
  const recordedGpsActivities = activities.filter(activity => activity.source === 'gps' && !activity.id.startsWith('demo-'))
  const gpsActivityCount = recordedGpsActivities.length

  const gpsPace = gpsDistance > 0.01 && gpsSeconds > 0 ? Math.round(gpsSeconds / gpsDistance) : null
  const gpsPaceLabel = gpsPace !== null ? `${Math.floor(gpsPace / 60)}:${String(gpsPace % 60).padStart(2, '0')}` : '--:--'
  const formatActivityTime = (seconds: number) => `${Math.floor(seconds / 3600) ? Math.floor(seconds / 3600) + 'h ' : ''}${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}min ${String(seconds % 60).padStart(2, '0')}s`
  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !postFile || publishBusy) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
    if (!allowed.includes(postFile.type)) {
      setPublishError('Format autorisé : JPG, PNG, WebP ou MP4.')
      return
    }
    if (postFile.size > 50 * 1024 * 1024) {
      setPublishError('Le fichier doit faire 50 Mo maximum.')
      return
    }

    setPublishBusy(true)
    setPublishError('')
    const extension = postFile.type === 'video/mp4' ? 'mp4'
      : postFile.type === 'image/png' ? 'png'
      : postFile.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${session.user.id}/posts/${crypto.randomUUID()}.${extension}`
    let uploaded = false
    try {
      const { error: uploadError } = await supabase.storage
        .from('social-media')
        .upload(path, postFile, { contentType: postFile.type })
      if (uploadError) throw uploadError
      uploaded = true

      const mediaUrl = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
      const { error: insertError } = await supabase.from('social_posts').insert({
        user_id: session.user.id,
        caption: postCaption.trim(),
        media_url: mediaUrl,
        media_type: postFile.type === 'video/mp4' ? 'video' : 'image',
        hide_like_count: hideLikeCount,
        comments_disabled: commentsDisabled
      })
      if (insertError) throw insertError

      setPostFile(null)
      setPostCaption('')
      setHideLikeCount(false)
      setCommentsDisabled(false)
      setCreationOpen(false)
      setCreationType(null)
      setPage('profil')
      await loadPosts()
    } catch (error) {
      if (uploaded) {
        await supabase.storage.from('social-media').remove([path])
      }
      setPublishError(error instanceof Error ? error.message : 'Publication impossible.')
    } finally {
      setPublishBusy(false)
    }
  }

  function closeCreation() {
    if (publishBusy) return
    setCreationOpen(false)
    setCreationType(null)
    setPostFile(null)
    setPostCaption('')
    setHideLikeCount(false)
    setCommentsDisabled(false)
    setPublishError('')
  }

  async function updatePostPrivacy(post: SocialPost, changes: Partial<Pick<SocialPost, 'hide_like_count' | 'comments_disabled'>>) {
    if (!session || post.user_id !== session.user.id || postSettingsBusy) return
    setPostSettingsBusy(true)
    setPostSettingsError('')
    try {
      const { error } = await supabase.from('social_posts')
        .update(changes).eq('id', post.id).eq('user_id', session.user.id)
      if (error) throw error
      setPosts(current => current.map(item => item.id === post.id ? { ...item, ...changes } : item))
      setSelectedPost(current => current?.id === post.id ? { ...current, ...changes } : current)
    } catch (error) {
      setPostSettingsError(error instanceof Error ? error.message : 'Modification impossible.')
    } finally {
      setPostSettingsBusy(false)
    }
  }

  const isDemoPost = (postId: string) => postId.startsWith('demo-') || postId.startsWith('discover-demo-')

  async function loadInteractions(currentPosts: SocialPost[]) {
    const ids = currentPosts.map(post => post.id)
    if (!ids.length) {
      setPostLikeCounts({}); setStoredComments({}); setCommentLikeCounts({})
      return
    }
    try {
      const [likesResult, commentsResult] = await Promise.all([
        supabase.from('social_post_likes').select('post_id, user_id').in('post_id', ids),
        supabase.from('social_comments').select('id, post_id, user_id, content, created_at, parent_id').in('post_id', ids).order('created_at', { ascending: true }).limit(1000)
      ])
      if (likesResult.error) throw likesResult.error
      if (commentsResult.error) throw commentsResult.error
      const likes: Record<string, number> = {}
      const ownLikes: Record<string, boolean> = {}
      for (const like of likesResult.data ?? []) {
        likes[like.post_id] = (likes[like.post_id] || 0) + 1
        if (like.user_id === session?.user.id) ownLikes[like.post_id] = true
      }
      setPostLikeCounts(likes)
      setLikedPosts(current => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => isDemoPost(id))), ...ownLikes }))
      const grouped: Record<string, StoredComment[]> = {}
      const fetched = (commentsResult.data ?? []) as StoredComment[]
      for (const comment of fetched) (grouped[comment.post_id] ||= []).push(comment)
      setStoredComments(grouped)
      const userIds = [...new Set(fetched.map(comment => comment.user_id))]
      if (userIds.length) {
        const { data, error } = await supabase.from('social_profiles').select('user_id, first_name, username').in('user_id', userIds)
        if (error) throw error
        const names: Record<string, string> = {}
        for (const person of data ?? []) names[person.user_id] = person.username ? '@' + person.username.replace(/^@/, '') : 'Sportif'
        setCommentAuthors(names)
      }
      const commentIds = fetched.map(comment => comment.id)
      if (commentIds.length) {
        const { data, error } = await supabase.from('social_comment_likes').select('comment_id, user_id').in('comment_id', commentIds)
        if (error) throw error
        const counts: Record<string, number> = {}
        const mine: Record<string, boolean> = {}
        for (const like of data ?? []) {
          counts[like.comment_id] = (counts[like.comment_id] || 0) + 1
          if (like.user_id === session?.user.id) mine[like.comment_id] = true
        }
        setCommentLikeCounts(counts)
        setLikedComments(current => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => id.includes(':'))), ...mine }))
      } else { setCommentLikeCounts({}) }
    } catch (error) {
      setInteractionMessage(error instanceof Error ? 'Interactions : ' + error.message : 'Impossible de charger les interactions.')
    }
  }

  async function toggleLike(postId: string) {
    if (isDemoPost(postId)) {
      setLikedPosts(current => ({ ...current, [postId]: !current[postId] }))
      return
    }
    const userId = session?.user.id
    if (!userId || interactionBusy['post:' + postId]) return
    const wasLiked = !!likedPosts[postId]
    setInteractionBusy(current => ({ ...current, ['post:' + postId]: true }))
    setLikedPosts(current => ({ ...current, [postId]: !wasLiked }))
    setPostLikeCounts(current => ({ ...current, [postId]: Math.max(0, (current[postId] || 0) + (wasLiked ? -1 : 1)) }))
    const result = wasLiked
      ? await supabase.from('social_post_likes').delete().eq('post_id', postId).eq('user_id', userId)
      : await supabase.from('social_post_likes').insert({ post_id: postId, user_id: userId })
    if (result.error) {
      setLikedPosts(current => ({ ...current, [postId]: wasLiked }))
      setPostLikeCounts(current => ({ ...current, [postId]: Math.max(0, (current[postId] || 0) + (wasLiked ? 1 : -1)) }))
      setInteractionMessage('Like impossible : ' + result.error.message)
    }
    setInteractionBusy(current => ({ ...current, ['post:' + postId]: false }))
  }

  async function submitComment(postId: string) {
    const value = (commentDrafts[postId] || '').trim()
    if (!value || value.length > 1000 || interactionBusy['comment:' + postId]) return
    const parentId = replyTo?.postId === postId ? replyTo.commentId : null
    if (isDemoPost(postId) && parentId) {
      setDemoReplies(current => ({ ...current, [postId]: [...(current[postId] || []), { id: `${postId}:reply:${Date.now()}`, name: profile?.username ? '@' + profile.username.replace(/^@/, '') : 'Sportif', text: value, demo: true, parentId }] }))
      setCommentDrafts(current => ({ ...current, [postId]: '' }))
      setReplyTo(null)
      return
    }
    if (isDemoPost(postId)) {
      setComments(current => ({ ...current, [postId]: [...(current[postId] || []), value] }))
      setCommentDrafts(current => ({ ...current, [postId]: '' }))
      return
    }
    const userId = session?.user.id
    if (!userId) return
    setInteractionBusy(current => ({ ...current, ['comment:' + postId]: true }))
    const { data, error } = await supabase.from('social_comments')
      .insert({ post_id: postId, user_id: userId, content: value, parent_id: parentId })
      .select('id, post_id, user_id, content, created_at, parent_id').single()
    if (error) setInteractionMessage('Commentaire impossible : ' + error.message)
    else if (data) {
      setStoredComments(current => ({ ...current, [postId]: [...(current[postId] || []), data as StoredComment] }))
      setCommentAuthors(current => ({ ...current, [userId]: profile?.username ? '@' + profile.username.replace(/^@/, '') : 'Sportif' }))
      setCommentDrafts(current => ({ ...current, [postId]: '' }))
      setReplyTo(null)
    }
    setInteractionBusy(current => ({ ...current, ['comment:' + postId]: false }))
  }

  function getDisplayComments(postId: string): DisplayComment[] {
    if (isDemoPost(postId)) {
      const base = [...(demoComments[postId] || []), ...(comments[postId] || []).map(text => ({ name: profile?.username ? '@' + profile.username.replace(/^@/, '') : 'Sportif', text }))]
        .map((comment, index) => ({ id: `${postId}:${index}`, name: comment.name.startsWith('@') ? comment.name : '@' + comment.name.toLowerCase(), text: comment.text, demo: true, parentId: null }))
      return [...base, ...(demoReplies[postId] || [])]
    }
    return (storedComments[postId] || []).map(comment => ({
      id: comment.id,
      name: commentAuthors[comment.user_id] || (comment.user_id === session?.user.id && profile?.username ? '@' + profile.username.replace(/^@/, '') : 'Sportif'),
      text: comment.content, demo: false, parentId: comment.parent_id
    }))
  }

  function threadedComments(postId: string): DisplayComment[] {
    const all = getDisplayComments(postId)
    const roots = all.filter(comment => !comment.parentId)
    return roots.flatMap(root => [root, ...all.filter(comment => comment.parentId === root.id)])
  }

  function replyButton(postId: string, comment: DisplayComment) {
    return (
      <button type="button" onClick={() => {
        setReplyTo({ postId, commentId: comment.parentId || comment.id, username: comment.name })
        setCommentModal(current => current?.id === postId ? current : { id: postId, author: '', caption: '' })
      }} style={{ ...linkStyle, color: '#a4a4ad', fontSize: 12, padding: '4px 0' }}>Répondre</button>
    )
  }

  async function toggleCommentLike(commentId: string, demo: boolean) {
    if (demo) {
      setLikedComments(current => ({ ...current, [commentId]: !current[commentId] }))
      return
    }
    const userId = session?.user.id
    if (!userId || interactionBusy['heart:' + commentId]) return
    const wasLiked = !!likedComments[commentId]
    setInteractionBusy(current => ({ ...current, ['heart:' + commentId]: true }))
    setLikedComments(current => ({ ...current, [commentId]: !wasLiked }))
    setCommentLikeCounts(current => ({ ...current, [commentId]: Math.max(0, (current[commentId] || 0) + (wasLiked ? -1 : 1)) }))
    const result = wasLiked
      ? await supabase.from('social_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId)
      : await supabase.from('social_comment_likes').insert({ comment_id: commentId, user_id: userId })
    if (result.error) {
      setLikedComments(current => ({ ...current, [commentId]: wasLiked }))
      setCommentLikeCounts(current => ({ ...current, [commentId]: Math.max(0, (current[commentId] || 0) + (wasLiked ? 1 : -1)) }))
      setInteractionMessage('Like du commentaire impossible : ' + result.error.message)
    }
    setInteractionBusy(current => ({ ...current, ['heart:' + commentId]: false }))
  }

  async function sharePost(postId: string, caption: string, mediaUrl?: string) {
    const url = mediaUrl || window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MatchFit Social', text: caption, url })
      } else {
        await navigator.clipboard.writeText(url)
        setInteractionMessage('Lien copié !')
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setInteractionMessage('Partage impossible sur cet appareil.')
      }
    }
  }

  const demoComments: Record<string, { name: string; text: string }[]> = {
    'demo-Emma': [
      { name: 'Lucas', text: 'Incroyable ce paysage 🔥' },
      { name: 'Clara', text: 'Bravo pour ta sortie ! ❤️' },
      { name: 'Thomas', text: 'Ça donne envie de courir ! 💪' }
    ],
    'demo-Lucas': [
      { name: 'Emma', text: 'Grosse séance, bravo ! 💪' },
      { name: 'Clara', text: 'La motivation est là 🔥' },
      { name: 'Nina', text: 'Super progression !' }
    ],
    'demo-Clara': [
      { name: 'Emma', text: 'On lâche rien ! ❤️' },
      { name: 'Lucas', text: 'Bien joué 🔥' },
      { name: 'Nina', text: 'Tu motives tout le monde !' }
    ]
  }

  function postOptions(postId: string, authorName: string, isDemo: boolean) {
    return (
      <div style={{ marginLeft: 'auto', position: 'relative' }}>
        <button type="button" aria-label={`Options de la publication de ${authorName}`}
          aria-expanded={postMenu === postId}
          onClick={() => setPostMenu(current => current === postId ? null : postId)}
          style={{ background: 'transparent', border: 'none', color: '#f5f5f5',
            fontSize: 25, lineHeight: 1, padding: '8px 4px', cursor: 'pointer' }}>•••</button>
        {postMenu === postId && (
          <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 20,
            background: '#24252e', border: '1px solid #444550', borderRadius: 12,
            boxShadow: '0 8px 25px rgba(0,0,0,.45)', minWidth: 205, padding: 5 }}>
            <button type="button" onClick={() => {
              setPostMenu(null)
              setReportPost({ id: postId, author: authorName, demo: isDemo })
              setReportReason('Spam')
              setReportDetails('')
              setReportMessage('')
            }} style={{ width: '100%', textAlign: 'left', background: 'transparent',
              border: 'none', padding: '12px', color: '#ff8a83', cursor: 'pointer', fontSize: 14 }}>
              Signaler la publication
            </button>
          </div>
        )}
      </div>
    )
  }

  function commentHeart(comment: DisplayComment) {
    const liked = !!likedComments[comment.id]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button type="button" aria-label={liked ? 'Ne plus aimer ce commentaire' : 'Aimer ce commentaire'}
          aria-pressed={liked} disabled={!!interactionBusy['heart:' + comment.id]}
          onClick={() => void toggleCommentLike(comment.id, comment.demo)}
          style={{ background: 'transparent', border: 'none', padding: '6px',
            color: liked ? '#ff6558' : '#a4a4ad', cursor: 'pointer' }}>
          <ModernHeart filled={liked} size={19} />
        </button>
        {!comment.demo && (commentLikeCounts[comment.id] || 0) > 0 &&
          <span style={{ color: '#a4a4ad', fontSize: 11 }}>{commentLikeCounts[comment.id]}</span>}
      </div>
    )
  }

  function postInteractions(postId: string, caption: string, authorName: string, mediaUrl?: string, hideLikeCount = false, commentsOff = false) {
    const displayComments = getDisplayComments(postId)
    const total = displayComments.length
    return (
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <button type="button" onClick={() => void toggleLike(postId)} disabled={!!interactionBusy['post:' + postId]} aria-label={likedPosts[postId] ? 'Retirer le like' : 'Aimer'}
            style={{ ...linkStyle, color: likedPosts[postId] ? '#ff6558' : '#f5f5f5', fontSize: 27, padding: '2px 0' }}>
            <ModernHeart filled={!!likedPosts[postId]} size={27} />
          </button>
          {!commentsOff && <button type="button" onClick={() => setCommentModal({ id: postId, author: authorName, caption })}
            aria-label="Voir et ajouter des commentaires"
            style={{ ...linkStyle, color: '#f5f5f5', padding: '2px 0', display: 'flex', alignItems: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
            </svg>
          </button>}
          <button type="button" onClick={() => void sharePost(postId, caption, mediaUrl)} aria-label="Partager"
            style={{ ...linkStyle, color: '#f5f5f5', fontSize: 25, padding: '2px 0' }}>↗</button>
        </div>
        {!hideLikeCount && <p style={{ margin: '5px 0 8px', fontSize: 13, fontWeight: 700 }}>{isDemoPost(postId) ? (likedPosts[postId] ? 1 : 0) : (postLikeCounts[postId] || 0)} J’aime</p>}
        {caption.trim() && (
          <p style={{ margin: '7px 0 8px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            <strong>{authorName}</strong> {caption}
          </p>
        )}
        {!commentsOff && total > 0 && (
          <>
            <button type="button" onClick={() => setCommentModal({ id: postId, author: authorName, caption })}
              style={{ ...linkStyle, padding: '3px 0 7px', color: '#a4a4ad', fontSize: 13 }}>
              Voir les {total} commentaires
            </button>
            {displayComments.slice(0, 3).map(comment => (
              <div key={comment.id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0', fontSize: 13, color: '#e6e6e9' }}>
                <span style={{ flex: 1 }}><strong>{comment.name}</strong> {comment.text}</span>
                {commentHeart(comment)}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  async function openMemberProfile(userId: string) {
    if (userId === session?.user.id) {
      setViewedProfile(null)
      setSelectedPost(null)
      setPage('profil')
      return
    }
    if (userId.startsWith('demo-') || userId.startsWith('discover-demo-')) {
      setInteractionMessage('Ce profil est une démonstration, sans compte réel.')
      return
    }
    setSelectedPost(null)
    setViewedProfileLoading(true)
    setViewedProfileError('')
    setViewedProfile(null)
    try {
      const [person, followers, follows, mine] = await Promise.all([
        supabase.from('social_profiles').select('user_id, first_name, username, city, sports, bio, avatar_url, is_private').eq('user_id', userId).maybeSingle(),
        supabase.from('social_follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('social_follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('social_follows').select('follower_id').eq('follower_id', session!.user.id).eq('following_id', userId).maybeSingle()
      ])
      if (person.error) throw person.error
      if (!person.data) throw new Error('Profil introuvable.')
      if (followers.error) throw followers.error
      if (follows.error) throw follows.error
      if (mine.error) throw mine.error
      setViewedProfile(person.data as SocialProfile)
      setFollowerCount(followers.count ?? 0)
      setFollowingCount(follows.count ?? 0)
      setFollowing(!!mine.data)
      const { data: pending, error: pendingError } = await supabase.from('social_follow_requests').select('follower_id').eq('follower_id', session!.user.id).eq('following_id', userId).maybeSingle()
      if (pendingError) throw pendingError
      setFollowRequested(!!pending)
    } catch (error) {
      setViewedProfileError(error instanceof Error ? error.message : 'Impossible de charger ce profil.')
    } finally {
      setViewedProfileLoading(false)
    }
  }

  async function toggleFollow() {
    if (!session || !viewedProfile || followBusy) return
    setFollowBusy(true)
    setViewedProfileError('')
    try {
      if (following) {
        const { error } = await supabase.from('social_follows').delete().eq('follower_id', session.user.id).eq('following_id', viewedProfile.user_id)
        if (error) throw error
        setFollowing(false)
        setFollowerCount(current => Math.max(0, current - 1))
      } else if (followRequested) {
        const { error } = await supabase.from('social_follow_requests').delete().eq('follower_id', session.user.id).eq('following_id', viewedProfile.user_id)
        if (error) throw error
        setFollowRequested(false)
      } else if (viewedProfile.is_private) {
        const { error } = await supabase.from('social_follow_requests').insert({ follower_id: session.user.id, following_id: viewedProfile.user_id })
        if (error) throw error
        setFollowRequested(true)
      } else {
        const { error } = await supabase.from('social_follows').insert({ follower_id: session.user.id, following_id: viewedProfile.user_id })
        if (error) throw error
        setFollowing(true)
        setFollowerCount(current => current + 1)
      }
    } catch (error) {
      setViewedProfileError(error instanceof Error ? error.message : 'Abonnement impossible.')
    } finally { setFollowBusy(false) }
  }

  async function loadFollowRequests() {
    if (!session) return
    const { data, error } = await supabase.from('social_follow_requests').select('follower_id').eq('following_id', session.user.id)
    if (error) { setProfileError(error.message); return }
    const ids = (data ?? []).map(row => row.follower_id)
    if (!ids.length) { setFollowRequests([]); return }
    const { data: people } = await supabase.from('social_profiles').select('user_id, username, first_name').in('user_id', ids)
    setFollowRequests(ids.map(id => ({ follower_id: id, username: people?.find(p => p.user_id === id)?.username || people?.find(p => p.user_id === id)?.first_name || 'Sportif' })))
  }

  async function respondToFollowRequest(followerId: string, accept: boolean) {
    if (!session) return
    try {
      if (accept) {
        const { error } = await supabase.from('social_follows').insert({ follower_id: followerId, following_id: session.user.id })
        if (error) throw error
      }
      const { error } = await supabase.from('social_follow_requests').delete().eq('follower_id', followerId).eq('following_id', session.user.id)
      if (error) throw error
      await loadFollowRequests()
    } catch (error) { setProfileError(error instanceof Error ? error.message : 'Action impossible.') }
  }

  // Les vidéos du fil Découvrir ne jouent que lorsqu'elles sont visibles.
  useEffect(() => {
    if (!selectedPost || !reelsMode || !reelsContainerRef.current) return
    const container = reelsContainerRef.current
    const videos = Array.from(container.querySelectorAll<HTMLVideoElement>('video[data-reel-video]'))
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          void video.play().catch(() => {})
        } else {
          video.pause()
        }
      }
    }, { root: container, threshold: [0, 0.6, 1] })
    videos.forEach(video => observer.observe(video))
    return () => {
      observer.disconnect()
      videos.forEach(video => video.pause())
    }
  }, [selectedPost?.id, reelsMode])

  function renderPost(post: SocialPost, inPreview = false) {
    const author = authors[post.user_id]
    const authorName = author?.username ? '@' + author.username.replace(/^@/, '') : post.user_id === session?.user.id && profile?.username ? '@' + profile.username.replace(/^@/, '') : author?.first_name || 'Sportif MatchFit'
    const avatarUrl = (post.user_id === session?.user.id ? profile?.avatar_url : null) || author?.avatar_url
    return (
      <article className="post" key={post.id} style={{ marginBottom: inPreview ? 0 : 28 }}>
        <div className="post-header" style={{ paddingLeft: 16, paddingRight: 16 }}>
          <button type="button" className="avatar" aria-label={'Voir le profil de ' + authorName}
            onClick={() => void openMemberProfile(post.user_id)}
            style={{ overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (author?.first_name?.[0] || authorName.replace('@', '')[0] || 'M').toUpperCase()}
          </button>
          <div>
            <button type="button" onClick={() => void openMemberProfile(post.user_id)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{authorName}</button>
            <p>{new Date(post.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {post.user_id !== session?.user.id && !isDemoPost(post.id) && postOptions(post.id, authorName, false)}
          {inPreview && post.user_id === session?.user.id && (
            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <button type="button" aria-label="Gérer ma publication" aria-expanded={ownPostMenuOpen === post.id}
                onClick={() => setOwnPostMenuOpen(current => current === post.id ? null : post.id)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 25, cursor: 'pointer', padding: '8px 4px' }}>•••</button>
              {ownPostMenuOpen === post.id && <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, width: 275,
                maxWidth: 'calc(100vw - 70px)', background: '#24252e', border: '1px solid #444550', borderRadius: 12,
                padding: 15, boxShadow: '0 8px 25px rgba(0,0,0,.5)' }}>
                <strong style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>Confidentialité de la publication</strong>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, fontSize: 13 }}>
                  Masquer le nombre de J’aime
                  <input type="checkbox" checked={post.hide_like_count} disabled={postSettingsBusy}
                    onChange={event => void updatePostPrivacy(post, { hide_like_count: event.target.checked })} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  Désactiver les commentaires
                  <input type="checkbox" checked={post.comments_disabled} disabled={postSettingsBusy}
                    onChange={event => void updatePostPrivacy(post, { comments_disabled: event.target.checked })} />
                </label>
                {postSettingsError && <p role="alert" style={{ color: '#ff7777', fontSize: 12 }}>{postSettingsError}</p>}
              </div>}
            </div>
          )}
        </div>
        <div style={{ margin: '0 16px', background: '#101116', borderRadius: 12, overflow: 'hidden' }}>
          {post.media_type === 'video' ? (
            <video src={post.media_url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain' }} />
          ) : (
            <img src={post.media_url} alt={post.caption || 'Publication sportive'} style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain' }} />
          )}
        </div>
        {postInteractions(post.id, post.caption, authorName, post.media_url, post.hide_like_count, post.comments_disabled)}
      </article>
    )
  }

  function updateProfile(changes: Partial<SocialProfile>) {
    setProfile(current =>
      current ? { ...current, ...changes } : current
    )
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session || !profile || profileBusy) return

    const username =
      profile.username?.trim().replace(/^@/, '').toLowerCase() || null

    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      setProfileError(
        'Le pseudo doit contenir 3 à 30 caractères : lettres, chiffres ou _.'
      )
      return
    }

    setProfileBusy(true)
    setProfileError('')
    setProfileMessage('')

    try {
      let avatarUrl = profile.avatar_url

      if (avatarFile) {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type)
        ) {
          throw new Error('Choisis une photo JPG, PNG ou WebP.')
        }

        if (avatarFile.size > 5 * 1024 * 1024) {
          throw new Error('La photo doit peser moins de 5 Mo.')
        }

        const extension =
          avatarFile.type === 'image/png'
            ? 'png'
            : avatarFile.type === 'image/webp'
              ? 'webp'
              : 'jpg'

        const path =
          `${session.user.id}/avatars/${crypto.randomUUID()}.${extension}`

        const { error: uploadError } = await supabase.storage
          .from('social-media')
          .upload(path, avatarFile, {
            contentType: avatarFile.type
          })

        if (uploadError) {
          throw new Error(
            'Photo non enregistrée : ' + uploadError.message
          )
        }

        avatarUrl = supabase.storage
          .from('social-media')
          .getPublicUrl(path).data.publicUrl
      }

      const updated: SocialProfile = {
        ...profile,
        user_id: session.user.id,
        first_name: profile.first_name.trim(),
        username,
        city: profile.city.trim(),
        bio: profile.bio.trim(),
        sports: [
          ...new Set(
            sportsText
              .split(',')
              .map(sport => sport.trim())
              .filter(Boolean)
          )
        ],
        avatar_url: avatarUrl
      }

      const { error } = await supabase
        .from('social_profiles')
        .upsert(updated, { onConflict: 'user_id' })

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'Ce pseudo est déjà utilisé. Choisis-en un autre.'
          )
        }

        throw error
      }

      setProfile(updated)
      setPrivacyByUser(current => ({ ...current, [updated.user_id]: updated.is_private }))
      setAuthors(current => ({ ...current, [updated.user_id]: { first_name: updated.first_name, username: updated.username, avatar_url: updated.avatar_url } }))
      setSportsText(updated.sports.join(', '))
      setAvatarFile(null)
      setProfileEditing(false)
      setProfileMessage('Ton profil a bien été enregistré !')
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : 'Impossible de sauvegarder ton profil.'
      )
    } finally {
      setProfileBusy(false)
    }
  }

  function changeAuthMode(mode: AuthMode) {
    setAuthMode(mode)
    setAuthMessage('')
    setAuthError('')
    setPassword('')
    setShowPassword(false)
    setShowLoginSuggestion(false)
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (authBusy) return

    setAuthBusy(true)
    setAuthError('')
    setAuthMessage('')
    setShowLoginSuggestion(false)

    try {
      if (authMode === 'inscription') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        })

        if (error) {
          const message = error.message.toLowerCase()

          if (
            error.code === 'user_already_exists' ||
            message.includes('already registered') ||
            message.includes('already exists')
          ) {
            setAuthError(
              'Cette adresse e-mail possède déjà un compte MatchFit. Connecte-toi.'
            )
            setShowLoginSuggestion(true)
            return
          }

          throw error
        }

        if (!data.session) {
          setAuthMessage(
            'Si cette adresse peut être inscrite, vérifie ta boîte e-mail pour confirmer ton inscription.'
          )
          setShowLoginSuggestion(true)
        } else {
          setSession(data.session)
        }
      } else if (authMode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        })

        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: window.location.origin
          }
        )

        if (error) throw error

        setAuthMessage(
          'Si cette adresse possède un compte, tu recevras un e-mail.'
        )
        setShowLoginSuggestion(true)
      }
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Une erreur est survenue.'
      )
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      alert(error.message)
      return
    }

    setPage('accueil')
    setCreationOpen(false)
    setCreationType(null)
    changeAuthMode('connexion')
  }

  function openCreation(type: CreationType | null = null) {
    setCreationType(type)
    setCreationOpen(true)
  }

  if (authLoading) {
    return (
      <div className="app">
        <header className="topbar">
          <h1 className="logo">
            MATCH<span>FIT</span>
          </h1>
        </header>

        <p style={{ textAlign: 'center', marginTop: 60 }}>
          Chargement...
        </p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <header className="topbar">
          <h1 className="logo">
            MATCH<span>FIT</span>
          </h1>
        </header>

        <main
          style={{
            maxWidth: 390,
            margin: '55px auto',
            padding: 25,
            border: '1px solid #30313b',
            borderRadius: 24,
            background: '#17181f'
          }}
        >
          <h2 style={{ textAlign: 'center', marginTop: 0 }}>
            {authMode === 'connexion'
              ? 'Bienvenue sur MatchFit'
              : authMode === 'inscription'
                ? 'Rejoins MatchFit'
                : 'Mot de passe oublié'}
          </h2>

          <p
            style={{
              textAlign: 'center',
              color: '#a4a4ad',
              fontSize: 13,
              marginBottom: 25
            }}
          >
            {authMode === 'connexion'
              ? 'Connecte-toi à ta communauté sportive.'
              : authMode === 'inscription'
                ? 'Crée ton compte et partage ta passion du sport.'
                : 'Reçois un lien pour réinitialiser ton mot de passe.'}
          </p>

          <form onSubmit={handleAuth}>
            <label htmlFor="auth-email">
              Adresse e-mail
            </label>

            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="ton@email.com"
              style={fieldStyle}
            />

            {authMode !== 'oubli' && (
              <>
                <label htmlFor="auth-password">
                  Mot de passe
                </label>

                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      authMode === 'inscription'
                        ? 'new-password'
                        : 'current-password'
                    }
                    minLength={8}
                    required
                    value={password}
                    onChange={event =>
                      setPassword(event.target.value)
                    }
                    placeholder="Minimum 8 caractères"
                    style={{
                      ...fieldStyle,
                      paddingRight: 55
                    }}
                  />

                  <button
                    type="button"
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    aria-pressed={showPassword}
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 17,
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      color: '#a4a4ad',
                      cursor: 'pointer'
                    }}
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
              </>
            )}

            {authError && (
              <p
                role="alert"
                style={{
                  color: '#ff7777',
                  fontSize: 13
                }}
              >
                {authError}
              </p>
            )}

            {authMessage && (
              <p
                role="status"
                style={{
                  color: '#8ee0aa',
                  fontSize: 13,
                  lineHeight: 1.6
                }}
              >
                {authMessage}
              </p>
            )}

            {showLoginSuggestion && (
              <button
                type="button"
                onClick={() =>
                  changeAuthMode('connexion')
                }
                style={{
                  ...linkStyle,
                  width: '100%',
                  marginBottom: 14,
                  fontWeight: 700,
                  textDecoration: 'underline'
                }}
              >
                Déjà inscrit ? Se connecter
              </button>
            )}

            <button
              type="submit"
              disabled={authBusy}
              style={{
                ...primaryStyle,
                opacity: authBusy ? 0.6 : 1
              }}
            >
              {authBusy
                ? 'Patiente...'
                : authMode === 'connexion'
                  ? 'Se connecter'
                  : authMode === 'inscription'
                    ? "S'inscrire"
                    : 'Envoyer le lien'}
            </button>
          </form>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 15
            }}
          >
            {authMode === 'connexion' ? (
              <>
                <button
                  style={linkStyle}
                  onClick={() =>
                    changeAuthMode('oubli')
                  }
                >
                  Mot de passe oublié ?
                </button>

                <button
                  style={linkStyle}
                  onClick={() =>
                    changeAuthMode('inscription')
                  }
                >
                  Pas encore de compte ? Inscris-toi
                </button>
              </>
            ) : (
              <button
                style={linkStyle}
                onClick={() =>
                  changeAuthMode('connexion')
                }
              >
                Retour à la connexion
              </button>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">
          MATCH<span>FIT</span>
        </h1>

        {page === 'profil' && (
          <div className="topbar-actions">
            <button
              className="top-action"
              type="button"
              aria-label="Ouvrir les réglages"
              title="Réglages"
              onClick={() => { setPage('reglages'); setSettingsSection('accueil') }}
              style={{ fontSize: 25, lineHeight: 1 }}
            >
              ⚙
            </button>
          </div>
        )}
      </header>

      {page === 'accueil' && (
        <section className="home">
          <div className="stories">
            <div className="story" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative', width: 68, height: 68 }}>
                <div className="story-avatar" style={{ width: 64, height: 64, overflow: 'hidden', boxSizing: 'border-box' }}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Ma photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (profile?.first_name?.[0]?.toUpperCase() || '♡')}
                </div>
                <button
                  type="button"
                  aria-label="Ajouter une story"
                  onClick={() => openCreation('story')}
                  style={{ position: 'absolute', right: -2, bottom: 0, width: 27, height: 27,
                    borderRadius: '50%', background: '#ff6558', border: '3px solid #0b0c10',
                    color: '#fff', fontSize: 19, fontWeight: 700, lineHeight: '20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >+</button>
              </div>
              <span>Ma story</span>
            </div>
            {['Emma', 'Lucas', 'Clara'].map(name => (
              <button className="story" key={name} onClick={() => alert('Stories bientôt disponibles')}>
                <div className="story-avatar">{name[0]}</div>
                <span>{name}</span>
              </button>
            ))}
          </div>

          <div className="feed-title">
            <h2>Ton fil d'actualité</h2>
            <span>Sport & communauté</span>
          </div>

          {postsLoading && <p>Chargement des publications...</p>}
          {postsError && <p role="alert" style={{ color: '#ff7777' }}>{postsError}</p>}
          {!postsLoading && discoverVisiblePosts.length === 0 && !postsError && (
            <div style={cardStyle}>
              <p>Aucune publication des autres sportifs pour le moment.</p>
            </div>
          )}
          {posts.filter(post => post.user_id !== session.user.id && !privacyByUser[post.user_id]).map(post => renderPost(post))}

          {/* Publications fictives de démonstration : jamais enregistrées dans Supabase. */}
          <p style={{ margin: '24px 0 10px', fontSize: 12, color: '#a4a4ad' }}>
            Exemples de publications · Démonstration
          </p>
          {[
            {
              name: 'Emma', sport: 'Running', initial: 'E',
              image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=900&auto=format&fit=crop&q=80',
              caption: 'Sortie running du matin 🏃‍♀️ Chaque kilomètre compte !'
            },
            {
              name: 'Lucas', sport: 'Musculation', initial: 'L',
              image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900&auto=format&fit=crop&q=80',
              caption: 'Une belle séance de musculation aujourd’hui 💪'
            },
            {
              name: 'Clara', sport: 'Fitness', initial: 'C',
              image: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=900&auto=format&fit=crop&q=80',
              caption: 'On reste motivés, même les jours difficiles 🔥'
            }
          ].map(example => (
            <article className="post" key={example.name + '-demo'} style={{ marginBottom: 28 }}>
              <div className="post-header" style={{ paddingLeft: 16, paddingRight: 16 }}>
                <div className="avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {example.initial}
                </div>
                <div>
                  <strong>{example.name} <span style={{ color: '#a4a4ad', fontWeight: 400, fontSize: 11 }}>· Démo</span></strong>
                  <p>{example.sport}</p>
                </div>
                {postOptions('demo-' + example.name, example.name, true)}
              </div>
              <img src={example.image} alt={'Exemple de publication ' + example.sport}
                loading="lazy" style={{ display: 'block', width: 'calc(100% - 32px)', margin: '0 16px', maxHeight: 480, objectFit: 'cover', borderRadius: 12 }} />
              {postInteractions('demo-' + example.name, example.caption, example.name, example.image)}
            </article>
          ))}
        </section>
      )}

      {page === 'decouvrir' && (
        <section className="placeholder-page" style={{ marginTop: -28 }}>

          <label htmlFor="member-search" style={{ display: 'block', fontSize: 13, marginTop: 15 }}>Rechercher un sportif</label>
          <input id="member-search" type="search" value={discoverSearch}
            onChange={event => setDiscoverSearch(event.target.value)}
            placeholder="Pseudo, prénom, ville ou sport..." style={{ ...fieldStyle, marginBottom: 18 }} />
          {discoverPeopleError && <p role="alert" style={{ color: '#ff7777', fontSize: 12 }}>{discoverPeopleError}</p>}
          {normalizedDiscoverSearch && <>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Sportifs ({discoverMatches.length})</h3>
            {discoverMatches.slice(0, 30).map(person => (
              <button type="button" key={person.user_id} onClick={() => void openMemberProfile(person.user_id)}
                style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', textAlign: 'left', padding: '10px 4px',
                  background: 'transparent', border: 'none', borderBottom: '1px solid #30313b', color: '#fff', cursor: 'pointer' }}>
                <span style={{ width: 43, height: 43, borderRadius: '50%', overflow: 'hidden', background: '#24252e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {person.avatar_url ? <img src={person.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (person.first_name?.[0] || 'M').toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: 14 }}>{person.username ? '@' + person.username.replace(/^@/, '') : person.first_name || 'Sportif'}</strong>
                  <span style={{ color: '#a4a4ad', fontSize: 12 }}>{[person.city, ...(person.sports || [])].filter(Boolean).join(' · ')}</span></span>
                <span aria-label={person.is_private ? 'Compte privé' : 'Compte public'}>{person.is_private ? '🔒' : '›'}</span>
              </button>
            ))}
            {discoverMatches.length === 0 && <p style={{ color: '#a4a4ad' }}>Aucun sportif trouvé.</p>}
          </>}

          {postsLoading && <p>Chargement des publications...</p>}
          {postsError && <p role="alert" style={{ color: '#ff7777' }}>{postsError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3, marginTop: 16 }}>
            {discoverVisiblePosts.map(post => (
              <button key={post.id} type="button" aria-label={'Ouvrir la publication : ' + (post.caption || 'Sans description')}
                onClick={() => { setOwnPostMenuOpen(null); setReelsMode(true); setSelectedPost(post) }}
                style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', padding: 0, border: 'none', background: '#24252e', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
                {post.media_type === 'video' ? (
                  <>
                    <video src={post.media_url + '#t=0.1'} muted playsInline preload="metadata"
                      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 7, color: '#fff', fontSize: 18, textShadow: '0 1px 5px #000' }}>▶</span>
                  </>
                ) : (
                  <img src={post.media_url} alt="" loading="lazy"
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </button>
            ))}
          </div>
          {!normalizedDiscoverSearch && (
            <>
              <p style={{ color: '#a4a4ad', fontSize: 12, marginTop: 22, marginBottom: 8 }}>Publications de démonstration</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3 }}>
                {discoverDemos.map(post => (
                  <button key={post.id} type="button" aria-label={'Ouvrir la publication démo : ' + post.caption}
                    onClick={() => { setOwnPostMenuOpen(null); setReelsMode(true); setSelectedPost(post) }}
                    style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', padding: 0, border: 'none', background: '#24252e', overflow: 'hidden', cursor: 'pointer' }}>
                    <img src={post.media_url} alt={post.caption} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          )}
          {!postsLoading && discoverVisiblePosts.length === 0 &&
            <p style={{ color: '#a4a4ad' }}>Aucune publication publique pour le moment.</p>}

        </section>
      )}

      {page === 'activites' && (
        <section className="placeholder-page" style={{ paddingBottom: 110 }}>
          <h2>Mes activités</h2>
          {activityMode === 'list' ? (
            <>
              <div style={{ marginBottom: 22 }}>
                <button type="button" style={primaryStyle} onClick={() => { setActivityError(''); setActivityMode('choose') }}>＋ Enregistrer une activité</button>
              </div>
              {activityLoading && <p>Chargement de tes activités...</p>}
              {!activityLoading && activities.length === 0 && !activityError && <p style={{ color: '#a4a4ad' }}>Aucune activité pour le moment. Enregistre ta première séance !</p>}
              {activities.map(activity => <article key={activity.id} style={{ ...cardStyle, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}><strong>{activity.title}</strong><ActivityShare activity={activity} startMeters={0} endMeters={0} /></div>
                <p style={{ color: '#a4a4ad', fontSize: 13 }}>{activity.sport} · {new Date(activity.started_at).toLocaleDateString('fr-CH')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}><span>⏱ {formatActivityTime(activity.duration_seconds)}</span>{activity.distance_km !== null && <span>↗ {activity.distance_km.toFixed(2)} km</span>}{activity.elevation_m !== null && <span>⛰ {activity.elevation_m} m</span>}</div>
                {activity.distance_km !== null && activity.distance_km > 0 && <p style={{ fontSize: 12, color: '#a4a4ad' }}>Allure moyenne : {Math.floor(activity.duration_seconds / 60 / activity.distance_km)}:{String(Math.round(activity.duration_seconds / activity.distance_km) % 60).padStart(2, '0')} /km</p>}
                {activity.notes && <p style={{ fontSize: 13 }}>{activity.notes}</p>}
                {activity.source === 'gps' && activity.route && activity.route.length > 0 && (activity.route.length ? <ActivityMap points={activity.route} height={220} /> : <p style={{ color: '#a4a4ad', fontSize: 12 }}>Parcours masqué pour protéger les lieux de départ et d’arrivée.</p>)}
                <button type="button" disabled={deletingActivityId === activity.id} onClick={() => void deleteActivity(activity)} style={{ ...linkStyle, color: '#ff7777', paddingLeft: 0, marginTop: 8 }}>{deletingActivityId === activity.id ? 'Suppression…' : 'Supprimer cette activité'}</button>
              </article>)}
              <div style={{ marginTop: 26 }}>
                <h3 style={{ marginBottom: 5 }}>Activités de démonstration</h3>
                <p style={{ color: '#a4a4ad', fontSize: 12, marginTop: 0 }}>Exemples fictifs pour découvrir le journal sportif. Rien n'est ajouté à ton compte.</p>
                {demoActivities.map(demo => {
                  const visibleRoute = demo.route ?? []
                  const pace = demo.duration_seconds / (demo.distance_km || 1)
                  return <article key={demo.id} style={{ ...cardStyle, marginTop: 12, borderColor: '#3d3e49' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div><strong>{demo.title}</strong><span style={{ color: '#ff8a4b', fontSize: 10, fontWeight: 700, marginLeft: 8 }}>DÉMO</span></div>
                      <ActivityShare activity={demo} startMeters={0} endMeters={0} />
                    </div>
                    <p style={{ color: '#a4a4ad', fontSize: 13 }}>{demo.sport} · Parcours fictif</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 14 }}>
                      <span>↗ {demo.distance_km?.toFixed(2)} km</span>
                      <span>⏱ {formatActivityTime(demo.duration_seconds)}</span>
                      <span>⛰ +{demo.elevation_m} m</span>
                    </div>
                    {!hidePace && demo.distance_km !== null && <p style={{ fontSize: 12, color: '#a4a4ad' }}>Allure moyenne : {Math.floor(pace / 60)}:{String(Math.round(pace % 60)).padStart(2, '0')} /km</p>}
                    {visibleRoute.length > 1 ? <ActivityMap points={visibleRoute} height={220} /> : <p style={{ color: '#a4a4ad', fontSize: 12 }}>Parcours masqué par les réglages de confidentialité.</p>}
                  </article>
                })}
              </div>
            </>
          ) : activityMode === 'preview' ? (
            <div style={cardStyle}>
              <button type="button" style={{ ...linkStyle, paddingLeft: 0 }} onClick={() => setActivityMode('gps')}>← Retour à l’enregistrement</button>
              <h3>Récapitulatif · {activitySport}</h3>
              <p>{activityTitle.trim() || 'Ma séance du jour'}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 15, marginBottom: 14 }}>
                <strong>↗ {gpsDistance.toFixed(2)} km</strong><strong>⏱ {formatActivityTime(gpsSeconds)}</strong><strong>⛰ +{Math.round(gpsElevation)} m</strong>
              </div>
              <h3>Confidentialité et affichage</h3>
              <p style={{ color: '#a4a4ad', fontSize: 12 }}>Choisis les parties du parcours à masquer avant publication. Les points masqués ne seront pas enregistrés dans l'activité publiée.</p>
              <PrivacyDistanceControls startMeters={hideStartMeters} endMeters={hideEndMeters} setStartMeters={setHideStartMeters} setEndMeters={setHideEndMeters} />
              {gpsPoints.length > 1 && (privacyRoute(gpsPoints, hideStartMeters, hideEndMeters).length > 1 ? <ActivityMap points={privacyRoute(gpsPoints, hideStartMeters, hideEndMeters)} height={230} /> : <p style={{ color: '#a4a4ad' }}>Parcours entièrement masqué avec ces réglages.</p>)}
              <button type="button" style={primaryStyle} disabled={activitySaving} onClick={() => void saveActivity('gps')}>{activitySaving ? 'Publication…' : 'Publier mon activité'}</button>
              <p style={{ fontSize: 12, color: '#a4a4ad' }}>Après publication, la confidentialité ne sera plus modifiable. Tu pourras supprimer l'activité.</p>
            </div>
          ) : activityMode === 'choose' ? (
            <div style={cardStyle}>
              <button type="button" style={{ ...linkStyle, paddingLeft: 0 }} onClick={() => setActivityMode('list')}>← Retour aux activités</button>
              <h3>Choisir un sport</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                {[
                  ['🏃', 'Course à pied'], ['⛰️', 'Trail'], ['🚴', 'Vélo'],
                  ['🚶', 'Marche'], ['🥾', 'Randonnée'], ['🏋️', 'Musculation'],
                  ['🏊', 'Natation'], ['💪', 'Fitness'], ['✨', 'Autre']
                ].map(([emoji, sport]) => (
                  <button key={sport} type="button" style={{ ...cardStyle, margin: 0, minHeight: 94, padding: 12, cursor: 'pointer', color: '#fff', textAlign: 'center', background: '#24252e', border: '1px solid #3d3e49' }} onClick={() => { setActivitySport(sport); setActivityTitle(''); setActivityError(''); setGpsError(''); setGpsPreviewPosition(null); setActivityMode('gps') }}>
                    <span style={{ display: 'block', fontSize: 27, marginBottom: 8 }}>{emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{sport}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={cardStyle}>
              <button type="button" style={{ ...linkStyle, paddingLeft: 0 }} onClick={() => { if (gpsStatus !== 'idle') { setActivityError('Enregistre ton activité avant de quitter.'); return } setActivityMode('list') }}>← Retour aux activités</button>
              <h3>Enregistrement GPS · {activitySport}</h3>
              <label>Sport<select style={fieldStyle} value={activitySport} onChange={event => setActivitySport(event.target.value)}>{['Course à pied', 'Trail', 'Marche', 'Randonnée', 'Vélo', 'Musculation', 'Natation', 'Fitness', 'Autre'].map(sport => <option key={sport}>{sport}</option>)}</select></label>
              <label>Titre<input style={fieldStyle} value={activityTitle} onChange={event => setActivityTitle(event.target.value)} placeholder="Ma séance du jour" maxLength={100} /></label>
              {activityMode === 'manual' ? <>
                <label>Date<input type="date" style={fieldStyle} value={activityDate} onChange={event => setActivityDate(event.target.value)} required /></label>
                <label>Durée (minutes)<input type="number" min="1" step="1" style={fieldStyle} value={activityMinutes} onChange={event => setActivityMinutes(event.target.value)} placeholder="45" /></label>
                <label>Distance (km, facultatif)<input type="number" min="0" step="0.01" style={fieldStyle} value={activityDistance} onChange={event => setActivityDistance(event.target.value)} placeholder="8.5" /></label>
              </> : <div className="mf-gps-recorder">
                <div className="mf-gps-map-wrap"><ActivityMap points={gpsPoints.length ? gpsPoints : gpsPreviewPosition ? [gpsPreviewPosition] : []} follow height={290} /></div>
                <div className="mf-gps-stats" aria-live="polite">
                  <div className="mf-gps-stat"><span>Distance</span><strong>{gpsDistance.toFixed(2)}</strong><small>km</small></div>
                  <div className="mf-gps-stat"><span>Durée</span><strong>{String(Math.floor(gpsSeconds / 3600)).padStart(2, '0')}:{String(Math.floor(gpsSeconds / 60) % 60).padStart(2, '0')}:{String(gpsSeconds % 60).padStart(2, '0')}</strong><small>h:min:s</small></div>
                  {!hidePace && <div className="mf-gps-stat"><span>Allure moyenne</span><strong>{gpsPaceLabel}</strong><small>min/km</small></div>}
                  <div className="mf-gps-stat"><span>Dénivelé positif</span><strong>{gpsAltitudeSamples >= 2 ? `+${Math.round(gpsElevation)}` : '—'}</strong><small>m</small></div>
                </div>
                <div className="mf-gps-altitude">Altitude actuelle : <strong>{gpsCurrentAltitude === null ? '—' : `${Math.round(gpsCurrentAltitude)} m`}</strong></div>
                {gpsError && <p role="alert" className="mf-gps-error">{gpsError}</p>}
                <button type="button" style={primaryStyle} onClick={() => void toggleGpsRecording()} disabled={gpsStarting}>{gpsStarting ? 'Connexion GPS...' : gpsStatus === 'running' ? '⏸ Pause' : gpsStatus === 'paused' ? '▶ Reprendre' : '▶ Démarrer'}</button>
              </div>}
              {activityMode === 'manual' && <label>Dénivelé positif (m, facultatif)<input type="number" min="0" step="1" style={fieldStyle} value={activityElevation} onChange={event => setActivityElevation(event.target.value)} /></label>}
              <label>Notes<textarea style={{ ...fieldStyle, minHeight: 85 }} value={activityNotes} onChange={event => setActivityNotes(event.target.value)} placeholder="Comment s'est passée la séance ?" /></label>
              <button type="button" style={primaryStyle} disabled={activitySaving || (activityMode === 'gps' && (gpsStatus === 'running' || gpsStarting || gpsSeconds === 0))} onClick={() => setActivityMode('preview')}>{'Terminer et voir le récapitulatif'}</button>
            </div>
          )}
          {activityError && <p role="alert" style={{ color: '#ff7777' }}>{activityError}</p>}
        </section>
      )}

      {page === 'messages' && (
        <section className="placeholder-page">
          <h2>Messages</h2>
          <p>
            Retrouve tes conversations avec les autres sportifs.
          </p>
        </section>
      )}

      {page === 'profil' && (
        <section className="placeholder-page">
          <h2>Mon profil sportif</h2>
          <p>Ton espace sportif personnel.</p>
          <div style={{ ...cardStyle, borderColor: '#523728' }}>
            <h3 style={{ marginTop: 0 }}>🏆 Mes activités sportives</h3>
            {activityLoading ? <p style={{ color: '#a4a4ad' }}>Chargement des activités…</p> : <>
              <div style={{ padding: 14, borderRadius: 12, background: '#24252e', textAlign: 'center' }}>
                <strong style={{ display: 'block', fontSize: 28, color: '#ff8a4b' }}>{gpsActivityCount}</strong>
                <span style={{ fontSize: 12, color: '#d4d4dc' }}>Activités réalisées</span>
              </div>
              <p style={{ fontSize: 14, color: '#ffb18a', lineHeight: 1.5, marginBottom: 0 }}>
                {gpsActivityCount === 0 ? '✨ Ta première activité t’attend ! Chaque effort compte. Lance-toi !' :
                  gpsActivityCount >= 50 ? '🏆 50 activités ou plus ! Quelle constance !' :
                  gpsActivityCount >= 10 ? '💪 Déjà 10 activités ou plus, continue comme ça !' :
                  gpsActivityCount >= 5 ? '🔥 Déjà 5 activités ou plus, continue comme ça !' :
                  gpsActivityCount === 1 ? '🎉 Bravo pour ta première activité !' :
                  '🔥 Chaque activité te fait progresser, continue !'}
              </p>
            </>}
          </div>

          {profileLoading ? (
            <p>Chargement du profil...</p>
          ) : profile && (
            <>
              <div style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      border: '2px solid #ff6558',
                      background: '#24252e',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                  >
                    {(avatarPreview || profile.avatar_url) ? (
                      <img
                        src={
                          avatarPreview ||
                          profile.avatar_url ||
                          ''
                        }
                        alt="Photo de profil"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: 30,
                          color: '#ff8a4b'
                        }}
                      >
                        {profile.first_name
                          ? profile.first_name[0].toUpperCase()
                          : '♡'}
                      </span>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 5px' }}>
                      {profile.first_name || 'Ton prénom'}
                    </h3>

                    <p
                      style={{
                        margin: '0 0 5px',
                        color: '#ff8a4b'
                      }}
                    >
                      {profile.username
                        ? '@' + profile.username
                        : '@tonpseudo'}
                    </p>

                    <p
                      style={{
                        margin: 0,
                        color: '#a4a4ad',
                        fontSize: 13
                      }}
                    >
                      📍 {profile.city || 'Ta ville'}
                    </p>
                  </div>
                  <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', position: 'relative' }}>
                    <button type="button" aria-label="Options de mon profil" aria-expanded={profileMenuOpen}
                      onClick={() => setProfileMenuOpen(current => !current)}
                      style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 26, cursor: 'pointer', padding: '0 4px' }}>•••</button>
                    {profileMenuOpen && (
                      <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 25, minWidth: 190,
                        background: '#24252e', border: '1px solid #444550', borderRadius: 12, padding: 5,
                        boxShadow: '0 8px 25px rgba(0,0,0,.5)' }}>
                        <button type="button" onClick={() => {
                          setProfileEditing(true)
                          setProfileMenuOpen(false)
                          setProfileMessage('')
                          setProfileError('')
                        }} style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff',
                          textAlign: 'left', padding: 12, cursor: 'pointer', fontSize: 13 }}>
                          ✎ Modifier mon profil
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <p
                  style={{
                    marginTop: 18,
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {profile.bio ||
                    'Ajoute ta biographie sportive 💪'}
                </p>

                <p
                  style={{
                    fontSize: 13,
                    color: '#ff8a4b'
                  }}
                >
                  {profile.sports.length
                    ? profile.sports.join(' · ')
                    : 'Ajoute tes sports favoris'}
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    marginTop: 20,
                    textAlign: 'center'
                  }}
                >
                  {[
                    [String(posts.filter(post => post.user_id === session.user.id).length), 'Publications'],
                    [String(activities.length), 'Activités'],
                    ['0', 'Abonnés']
                  ].map(([count, label]) => (
                    <div
                      key={label}
                      style={{
                        background: '#24252e',
                        borderRadius: 12,
                        padding: '12px 4px'
                      }}
                    >
                      <strong style={{ fontSize: 18 }}>
                        {count}
                      </strong>

                      <p
                        style={{
                          fontSize: 11,
                          color: '#a4a4ad',
                          marginBottom: 0
                        }}
                      >
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

              {profile.is_private && <div style={{ marginTop: 16 }}>
                <button type="button" onClick={() => void loadFollowRequests()} style={{ ...linkStyle, paddingLeft: 0 }}>Voir les demandes d'abonnement</button>
                {followRequests.map(request => <div key={request.follower_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <span style={{ flex: 1 }}>@{request.username.replace(/^@/, '')}</span>
                  <button type="button" onClick={() => void respondToFollowRequest(request.follower_id, true)}>Accepter</button>
                  <button type="button" onClick={() => void respondToFollowRequest(request.follower_id, false)}>Refuser</button>
                </div>)}
              </div>}

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #30313b' }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>▦ Mes publications</h3>
                <button type="button" style={{ ...primaryStyle, marginTop: 16 }} onClick={() => openCreation('publication')}>
                  + Ajouter une publication
                </button>
                {postsLoading && <p>Chargement...</p>}
                {!postsLoading && posts.filter(post => post.user_id === session.user.id).length === 0 && (
                  <p style={{ textAlign: 'center', color: '#a4a4ad', fontSize: 13, marginTop: 25 }}>
                    Tu n'as pas encore de publications.
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, marginTop: 15 }}>
                  {posts.filter(post => post.user_id === session.user.id).map(post => (
                    <button type="button" key={post.id} aria-label="Ouvrir ma publication"
                      onClick={() => { setOwnPostMenuOpen(null); setSelectedPost(post) }}
                      style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 5, background: '#24252e',
                        position: 'relative', border: 'none', padding: 0, cursor: 'pointer' }}>
                      {post.media_type === 'video' ? (
                        <>
                          <video src={post.media_url} muted playsInline preload="metadata"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', top: 5, right: 6, color: '#fff', textShadow: '0 1px 4px #000' }}>▶</span>
                        </>
                      ) : (
                        <img src={post.media_url} alt={post.caption || 'Ma publication'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {profileEditing && (
                <form
                  onSubmit={saveProfile}
                  style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #30313b' }}
                >
                  <h3 style={{ marginTop: 0 }}>
                    Modifier mon profil
                  </h3>

                  <label htmlFor="profile-photo">
                    Photo de profil
                  </label>

                  <input
                    id="profile-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={event =>
                      setAvatarFile(
                        event.target.files?.[0] || null
                      )
                    }
                    style={{
                      ...fieldStyle,
                      padding: 10
                    }}
                  />

                  <label htmlFor="profile-first-name">
                    Prénom
                  </label>

                  <input
                    id="profile-first-name"
                    value={profile.first_name}
                    onChange={event =>
                      updateProfile({
                        first_name: event.target.value
                      })
                    }
                    placeholder="Ton prénom"
                    maxLength={60}
                    required
                    style={fieldStyle}
                  />

                  <label htmlFor="profile-username">
                    Pseudo
                  </label>

                  <input
                    id="profile-username"
                    value={profile.username || ''}
                    onChange={event =>
                      updateProfile({
                        username: event.target.value
                      })
                    }
                    placeholder="tonpseudo"
                    maxLength={30}
                    style={fieldStyle}
                  />

                  <label htmlFor="profile-city">
                    Ville
                  </label>

                  <input
                    id="profile-city"
                    value={profile.city}
                    onChange={event =>
                      updateProfile({
                        city: event.target.value
                      })
                    }
                    placeholder="Ta ville"
                    maxLength={100}
                    style={fieldStyle}
                  />

                  <label htmlFor="profile-sports">
                    Sports favoris
                  </label>

                  <input
                    id="profile-sports"
                    value={sportsText}
                    onChange={event =>
                      setSportsText(event.target.value)
                    }
                    placeholder="Musculation, Trail, Running"
                    style={fieldStyle}
                  />

                  <p
                    style={{
                      fontSize: 12,
                      color: '#a4a4ad',
                      marginTop: -10
                    }}
                  >
                    Sépare tes sports par une virgule.
                  </p>

                  <label htmlFor="profile-bio">
                    Biographie
                  </label>

                  <textarea
                    id="profile-bio"
                    value={profile.bio}
                    onChange={event =>
                      updateProfile({
                        bio: event.target.value
                      })
                    }
                    placeholder="Parle de ta passion du sport..."
                    rows={4}
                    maxLength={500}
                    style={{
                      ...fieldStyle,
                      resize: 'vertical'
                    }}
                  />

                  <label htmlFor="profile-private" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <input id="profile-private" type="checkbox" checked={profile.is_private}
                      onChange={event => updateProfile({ is_private: event.target.checked })} />
                    <span><strong>Compte privé</strong><br/><small style={{ color: '#a4a4ad' }}>Seuls tes abonnés acceptés voient tes publications. Découvrir affiche uniquement les comptes publics.</small></span>
                  </label>

                  <button
                    type="submit"
                    disabled={profileBusy}
                    style={{
                      ...primaryStyle,
                      opacity: profileBusy ? 0.6 : 1
                    }}
                  >
                    {profileBusy
                      ? 'Enregistrement...'
                      : 'Enregistrer mon profil'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileEditing(false)
                      setAvatarFile(null)
                      setProfileError('')
                    }}
                    style={{
                      ...linkStyle,
                      width: '100%',
                      marginTop: 10
                    }}
                  >
                    Annuler
                  </button>
                </form>
              )}
              </div>

              {profileError && (
                <p
                  role="alert"
                  style={{
                    color: '#ff7777',
                    fontSize: 13
                  }}
                >
                  {profileError}
                </p>
              )}

              {profileMessage && (
                <p
                  role="status"
                  style={{
                    color: '#8ee0aa',
                    fontSize: 13
                  }}
                >
                  {profileMessage}
                </p>
              )}


            </>
          )}

        </section>
      )}

      {page !== 'reglages' && <nav
        className="bottom-nav"
        aria-label="Navigation principale"
      >
        <button
          className={page === 'accueil' ? 'active' : ''}
          onClick={() => setPage('accueil')}
        >
          <span>⌂</span>
          Accueil
        </button>

        <button
          className={page === 'decouvrir' ? 'active' : ''}
          onClick={() => setPage('decouvrir')}
        >
          <span>⌕</span>
          Découvrir
        </button>

        <button
          className={page === 'activites' ? 'active' : ''}
          onClick={() => setPage('activites')}
        >
          <span>▥</span>
          Activités
        </button>

        <button
          className={page === 'messages' ? 'active' : ''}
          onClick={() => setPage('messages')}
        >
          <span>✉</span>
          Messages
        </button>

        <button
          className={page === 'profil' ? 'active' : ''}
          onClick={() => setPage('profil')}
        >
          <span>♙</span>
          Profil
        </button>
      </nav>}

      {reportPost && (
        <div role="presentation" onClick={() => setReportPost(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label="Signaler une publication"
            onClick={event => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: '#17181f', color: '#fff',
              padding: 22, borderRadius: 20, border: '1px solid #30313b', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 19, margin: 0 }}>Signaler la publication</h2>
              <button type="button" onClick={() => setReportPost(null)} aria-label="Fermer"
                style={{ ...linkStyle, color: '#fff', fontSize: 25 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#a4a4ad', margin: '14px 0' }}>
              Publication de {reportPost.author}
            </p>
            <form onSubmit={event => {
              event.preventDefault()
              // La collecte et la modération des signalements nécessitent une table Supabase dédiée.
              setReportMessage('Fonction de démonstration : aucun signalement n’a été transmis. La connexion à Supabase reste à créer.')
            }}>
              <label htmlFor="report-reason">Motif du signalement</label>
              <select id="report-reason" value={reportReason} onChange={event => setReportReason(event.target.value)}
                style={fieldStyle}>
                {['Spam', 'Contenu inapproprié', 'Harcèlement', 'Fausse information', 'Autre'].map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <label htmlFor="report-details">Précisions (facultatif)</label>
              <textarea id="report-details" rows={3} maxLength={500} value={reportDetails}
                onChange={event => setReportDetails(event.target.value)} style={fieldStyle}
                placeholder="Explique le problème..." />
              <button type="submit" style={primaryStyle}>Signaler</button>
              {reportMessage && <p role="status" style={{ color: '#ffba87', fontSize: 13, lineHeight: 1.5 }}>{reportMessage}</p>}
            </form>
          </div>
        </div>
      )}

      {commentModal && !posts.some(post => post.id === commentModal.id && post.comments_disabled) && (
        <div
          role="presentation"
          onClick={() => setCommentModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.58)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Commentaires"
            onClick={event => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, height: 'min(62dvh, 620px)', minHeight: 300,
              display: 'flex', flexDirection: 'column', background: '#17181f', color: '#fff',
              borderRadius: '22px 22px 0 0', overflow: 'hidden', boxSizing: 'border-box',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.45)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '18px 18px 14px', borderBottom: '1px solid #30313b',
            background: '#17181f', flexShrink: 0
          }}>
            <button type="button" aria-label="Retour aux publications"
              onClick={() => setCommentModal(null)}
              style={{ ...linkStyle, color: '#fff', fontSize: 26, padding: '0 8px 0 0' }}>←</button>
            <h2 style={{ margin: 0, fontSize: 19, flex: 1 }}>Commentaires</h2>
            <button type="button" aria-label="Fermer les commentaires"
              onClick={() => setCommentModal(null)}
              style={{ ...linkStyle, color: '#fff', fontSize: 25, padding: 0 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', width: '100%', maxWidth: 600, margin: '0 auto', boxSizing: 'border-box' }}>
            {commentModal.caption && (
              <p style={{ margin: '0 0 22px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, paddingBottom: 18, borderBottom: '1px solid #30313b' }}>
                <strong>{commentModal.author}</strong> {commentModal.caption}
              </p>
            )}
            {threadedComments(commentModal.id).map(comment => (
              <div key={comment.id} style={{ display: 'flex', gap: 12, marginBottom: comment.parentId ? 12 : 22, marginLeft: comment.parentId ? 35 : 0, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#30313b', color: '#ff8a4b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}>
                  {comment.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: '7px 0 2px', fontSize: 14, lineHeight: 1.5 }}><strong>{comment.name}</strong> {comment.text}</p>{replyButton(commentModal.id, comment)}</div>
                {commentHeart(comment)}
              </div>
            ))}
            {getDisplayComments(commentModal.id).length === 0 && (
              <p style={{ textAlign: 'center', color: '#a4a4ad', marginTop: 40 }}>Aucun commentaire pour le moment.</p>
            )}
          </div>
          {replyTo?.postId === commentModal.id && <div style={{ padding: '8px 18px', fontSize: 12, color: '#a4a4ad', display: 'flex', justifyContent: 'space-between' }}><span>Réponse à {replyTo.username}</span><button type="button" onClick={() => setReplyTo(null)} style={{ ...linkStyle, color: '#ff8a4b' }}>Annuler</button></div>}
          <form onSubmit={event => { event.preventDefault(); void submitComment(commentModal.id) }}
            style={{ display: 'flex', gap: 8, padding: '14px 18px max(18px, env(safe-area-inset-bottom))', borderTop: '1px solid #30313b', background: '#17181f', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
            <input aria-label="Ton commentaire" placeholder={replyTo?.postId === commentModal.id ? `Répondre à ${replyTo.username}...` : "Ajouter un commentaire..."}
              value={commentDrafts[commentModal.id] || ''}
              onChange={event => setCommentDrafts(current => ({ ...current, [commentModal.id]: event.target.value }))}
              style={{ ...fieldStyle, margin: 0, minWidth: 0, flex: 1, padding: 12 }} />
            <button type="submit" disabled={!(commentDrafts[commentModal.id] || '').trim() || !!interactionBusy['comment:' + commentModal.id]}
              style={{ ...primaryStyle, width: 'auto', padding: '10px 16px', opacity: (commentDrafts[commentModal.id] || '').trim() ? 1 : 0.5 }}>Publier</button>
          </form>
          </div>
        </div>
      )}

      {page === 'reglages' && (
        <main className="placeholder-page" style={{ minHeight: 'calc(100dvh - 80px)', paddingBottom: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <button type="button" aria-label="Retour" onClick={() => settingsSection === 'accueil' ? setPage('profil') : setSettingsSection('accueil')}
              style={{ ...linkStyle, fontSize: 24, padding: '5px 10px', color: '#fff' }}>←</button>
            <h2 style={{ margin: 0 }}>{({ accueil: 'Réglages', archives: 'Archives', confidentialite: 'Confidentialité', securite: 'Sécurité', conditions: "Conditions d’utilisation", donnees: 'Mes données' } as const)[settingsSection]}</h2>
          </div>
          {settingsSection === 'accueil' ? (
            <>
              <p style={{ color: '#a4a4ad', fontSize: 13 }}>Compte : {session.user.email}</p>
              {([
                ['archives', '◷', 'Archives', 'Retrouver toutes mes stories'],
                ['confidentialite', '♧', 'Confidentialité', 'Visibilité du profil et informations personnelles'],
                ['securite', '♢', 'Sécurité', 'Connexion et protection du compte'],
                ['conditions', '▤', "Conditions d’utilisation", 'Règles et documents légaux'],
                ['donnees', '▦', 'Mes données', 'Accès et gestion des données personnelles']
              ] as const).map(([key, symbol, label, description]) => (
                <button key={key} type="button" onClick={() => setSettingsSection(key)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14, padding: 18, marginBottom: 10,
                    borderRadius: 14, border: '1px solid #30313b', background: '#17181f', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 24, color: '#ff8a4b' }}>{symbol}</span>
                  <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>{label}</strong>
                    <small style={{ display: 'block', color: '#a4a4ad', marginTop: 5 }}>{description}</small></span>
                  <span style={{ color: '#a4a4ad' }}>›</span>
                </button>
              ))}
              <button type="button" onClick={handleLogout}
                style={{ ...primaryStyle, background: '#24252e', border: '1px solid #ff6558', color: '#ff8a4b', marginTop: 16 }}>
                Se déconnecter
              </button>
            </>
          ) : settingsSection === 'archives' ? (
            <div style={cardStyle}>
              <h3>Mes stories archivées</h3>
              <p style={{ color: '#a4a4ad', lineHeight: 1.6 }}>Tes stories sauvegardées apparaîtront ici après la mise en place des stories et des archives Supabase.</p>
            </div>
          ) : settingsSection === 'confidentialite' ? (
            <div style={cardStyle}>
              <h3>Confidentialité</h3>
              <p style={{ color: '#a4a4ad', lineHeight: 1.6 }}>Cette rubrique accueillera les paramètres de visibilité du profil, les préférences de confidentialité et la politique de confidentialité officielle de MatchFit.</p>
              <p style={{ color: '#ff8a4b', fontSize: 13 }}>Document légal à rédiger et valider avant publication.</p>
            </div>
          ) : settingsSection === 'securite' ? (
            <div style={cardStyle}>
              <h3>Sécurité du compte</h3>
              <p style={{ color: '#a4a4ad', lineHeight: 1.6 }}>Cette rubrique accueillera les options de sécurité, de changement de mot de passe et de gestion des sessions.</p>
              <button type="button" style={{ ...primaryStyle, marginTop: 12 }} onClick={async () => {
                if (!session.user.email) return
                const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: window.location.origin })
                setInteractionMessage(error ? error.message : 'E-mail de réinitialisation envoyé.')
              }}>Recevoir un lien pour réinitialiser mon mot de passe</button>
            </div>
          ) : settingsSection === 'conditions' ? (
            <div style={cardStyle}>
              <h3>Conditions d’utilisation</h3>
              <p style={{ color: '#a4a4ad', lineHeight: 1.6 }}>Les conditions d’utilisation, les règles de la communauté et les mentions légales seront accessibles ici après leur rédaction.</p>
              <p style={{ color: '#ff8a4b', fontSize: 13 }}>Textes juridiques non publiés pour le moment.</p>
            </div>
          ) : (
            <div style={cardStyle}>
              <h3>Mes données personnelles</h3>
              <p style={{ color: '#a4a4ad', lineHeight: 1.6 }}>Cette page permettra de demander l’exportation ou la suppression des données du compte. Ces actions ne sont pas encore disponibles.</p>
            </div>
          )}
          {interactionMessage && <p role="status" style={{ color: '#8ee0aa', fontSize: 13 }}>{interactionMessage}</p>}
        </main>
      )}

      {(viewedProfile || viewedProfileLoading || viewedProfileError) && (
        <div role="dialog" aria-modal="true" aria-label="Profil du membre"
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: '#0b0c10', overflowY: 'auto' }}>
          <div style={{ maxWidth: 620, margin: '0 auto', padding: '16px 16px 90px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #30313b', paddingBottom: 16 }}>
              <button type="button" aria-label="Fermer le profil" onClick={() => { setViewedProfile(null); setViewedProfileError(''); setViewedProfileLoading(false) }}
                style={{ ...linkStyle, color: '#fff', fontSize: 27 }}>←</button>
              <strong style={{ fontSize: 18 }}>{viewedProfile?.username ? '@' + viewedProfile.username.replace(/^@/, '') : 'Profil sportif'}</strong>
            </div>
            {viewedProfileLoading && <p>Chargement du profil...</p>}
            {viewedProfileError && <p role="alert" style={{ color: '#ff7777' }}>{viewedProfileError}</p>}
            {viewedProfile && <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 25 }}>
                <div style={{ width: 86, height: 86, borderRadius: '50%', overflow: 'hidden', background: '#24252e', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
                  {viewedProfile.avatar_url ? <img src={viewedProfile.avatar_url} alt="Photo de profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (viewedProfile.first_name?.[0] || 'M').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{viewedProfile.first_name || 'Sportif MatchFit'}</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, fontSize: 12, textAlign: 'center' }}>
                    <span><strong>{posts.filter(post => post.user_id === viewedProfile.user_id).length}</strong><br/>Publications</span>
                    <span><strong>{followerCount}</strong><br/>Abonnés</span>
                    <span><strong>{followingCount}</strong><br/>Abonnements</span>
                  </div>
                </div>
              </div>
              {viewedProfile.city && <p style={{ color: '#a4a4ad', fontSize: 13 }}>📍 {viewedProfile.city}</p>}
              {viewedProfile.bio && <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{viewedProfile.bio}</p>}
              {!!viewedProfile.sports?.length && <p style={{ color: '#ff8a4b', fontSize: 13 }}>{viewedProfile.sports.join(' · ')}</p>}
              <button type="button" disabled={followBusy} onClick={() => void toggleFollow()}
                style={{ ...primaryStyle, marginTop: 12, background: following ? '#30313b' : primaryStyle.background, opacity: followBusy ? 0.6 : 1 }}>
                {followBusy ? 'Patiente...' : following ? '✓ Abonné(e) · Se désabonner' : followRequested ? 'Demande envoyée · Annuler' : viewedProfile.is_private ? "Demander à s'abonner" : "S'abonner"}
              </button>
              {viewedProfile.is_private && !following && <p style={{ padding: 16, background: '#24252e', borderRadius: 12, marginTop: 20 }}>🔒 Compte privé · Abonne-toi et attends son accord pour voir ses publications.</p>}
              {(!viewedProfile.is_private || following) && <><h3 style={{ marginTop: 30, fontSize: 16 }}>Publications</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
                {posts.filter(post => post.user_id === viewedProfile.user_id).map(post => (
                  <button key={post.id} type="button" aria-label="Ouvrir la publication"
                    onClick={() => { setViewedProfile(null); setSelectedPost(post) }}
                    style={{ aspectRatio: '1', padding: 0, border: 'none', borderRadius: 5, overflow: 'hidden', background: '#24252e', cursor: 'pointer' }}>
                    {post.media_type === 'video'
                      ? <video src={post.media_url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={post.media_url} alt={post.caption || 'Publication'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </button>
                ))}
              </div></>}
            </>}
          </div>
        </div>
      )}

      {selectedPost && reelsMode && (
        <div role="dialog" aria-modal="true" aria-label="Vidéos Découvrir"
          style={{ position: 'fixed', top: 'env(safe-area-inset-top, 0px)', bottom: 'calc(75px + env(safe-area-inset-bottom, 0px))',
            left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 50,
            background: '#0b0c10', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, height: 65, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', borderBottom: '1px solid #30313b', background: '#0b0c10' }}>
            <strong style={{ fontSize: 27, fontWeight: 900, fontStyle: 'italic', letterSpacing: -1 }}>MATCH<span style={{ color: '#ff8a4b' }}>FIT</span></strong>
            <button type="button" onClick={() => { setSelectedPost(null); setReelsMode(false); setPostMenu(null) }}
              aria-label="Fermer les réels" style={{ border: 0, background: 'transparent', color: '#fff', fontSize: 27 }}>×</button>
          </div>
          <div ref={reelsContainerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
            scrollSnapType: 'y mandatory', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}>
            {(() => {
              const all = [...discoverVisiblePosts, ...discoverDemos]
              const index = all.findIndex(post => post.id === selectedPost.id)
              const ordered = index < 0 ? [selectedPost] : [...all.slice(index), ...all.slice(0, index)]
              return ordered.map(post => (
                <section key={post.id} style={{ height: '100%', minHeight: '100%', scrollSnapAlign: 'start',
                  scrollSnapStop: 'always', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0b0c10' }}>
                  <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#050506' }}>
                    {post.media_type === 'video'
                      ? <video data-reel-video="" src={post.media_url} playsInline muted loop preload="metadata"
                          onClick={event => { const video = event.currentTarget; if (video.paused) void video.play(); else video.pause() }}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <img src={post.media_url} alt={post.caption || 'Publication'} loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                    <span style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 11, color: '#fff',
                      background: 'rgba(0,0,0,.55)', padding: '5px 9px', borderRadius: 12 }}>↑ Glisse pour voir la suite</span>
                  </div>
                  <div style={{ flexShrink: 0, maxHeight: '36%', overflowY: 'auto', padding: '10px 14px 14px', background: '#0b0c10' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 13 }}>{post.caption}</p>
                    {postInteractions(post.id, post.caption,
                      authors[post.user_id]?.username ? '@' + authors[post.user_id].username!.replace(/^@/, '') : 'Sportif MatchFit',
                      post.media_url, post.hide_like_count, post.comments_disabled)}
                  </div>
                </section>
              ))
            })()}
          </div>
        </div>
      )}

      {selectedPost && !reelsMode && (
        <div role="dialog" aria-modal="true" aria-label="Publication en grand"
          style={{ position: 'fixed', top: 'env(safe-area-inset-top, 0px)', bottom: 'calc(75px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 50, background: '#0b0c10', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', minHeight: '100%', background: '#0b0c10', overflowX: 'hidden' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 60, height: 75, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #30313b', background: '#0b0c10' }}><strong style={{ fontSize: 27, fontWeight: 900, fontStyle: 'italic', letterSpacing: -1 }}>MATCH<span style={{ color: '#ff8a4b' }}>FIT</span></strong></div>
            <div style={{ position: 'sticky', top: 75, zIndex: 59, display: 'flex', alignItems: 'center', gap: 15,
              padding: '13px 16px', background: '#0b0c10', borderBottom: '1px solid #30313b' }}>
              <button type="button" aria-label="Retour aux publications"
                onClick={() => { setSelectedPost(null); setOwnPostMenuOpen(null); setPostMenu(null) }}
                style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 28,
                  lineHeight: 1, cursor: 'pointer', padding: '3px 8px 3px 0' }}>←</button>
              <strong style={{ fontSize: 17 }}>Publication</strong>
            </div>
            <div style={{ padding: '16px 0 80px' }}>
              {(() => {
                const currentPost = posts.find(post => post.id === selectedPost.id) || selectedPost
                // Même défilement pour son profil et les publications d'un autre membre.
                // Les publications du même auteur sont affichées à partir de celle sélectionnée.
                const authorPosts = [...posts, ...discoverDemos].filter(post => post.user_id === currentPost.user_id)
                const currentIndex = authorPosts.findIndex(post => post.id === currentPost.id)
                const visiblePosts = currentIndex >= 0
                  ? [...authorPosts.slice(currentIndex), ...authorPosts.slice(0, currentIndex)]
                  : [currentPost]
                return visiblePosts.map((post, index) => (
                  <div key={post.id} style={{ marginBottom: index === visiblePosts.length - 1 ? 0 : 28 }}>
                    {renderPost(post, true)}
                  </div>
                ))
              })()}
              {isDemoPost(selectedPost.id) && (
                <p style={{ padding: '0 16px 16px', color: '#a4a4ad', fontSize: 12 }}>
                  Exemple fictif : non enregistré dans Supabase.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {creationOpen && (
        <div className="creation-overlay">
          <div className="creation-panel">
            <div className="creation-header">
              <h2>{creationType === 'story' ? 'Nouvelle story' : creationType === 'publication' ? 'Nouvelle publication' : 'Créer sur MatchFit'}</h2>
              <button className="creation-close" onClick={closeCreation} disabled={publishBusy} aria-label="Fermer">✕</button>
            </div>
            {creationType === null ? (
              <div className="creation-options">
                <button onClick={() => setCreationType('story')}>
                  <span>◉</span><strong>Story</strong><small>Partage un moment sportif</small>
                </button>
                <button onClick={() => setCreationType('publication')}>
                  <span>▣</span><strong>Publication</strong><small>Photo, vidéo et performance</small>
                </button>
              </div>
            ) : creationType === 'story' ? (
              <div className="creation-form">
                <p>Les stories seront disponibles dans une prochaine étape.</p>
                <button className="creation-back" onClick={closeCreation}>Fermer</button>
              </div>
            ) : (
              <form className="creation-form" onSubmit={publishPost}>
                <p>Partage une photo ou une vidéo avec la communauté.</p>
                <label htmlFor="creation-media">Photo ou vidéo (50 Mo maximum)</label>
                <input
                  id="creation-media"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  required
                  onChange={event => setPostFile(event.target.files?.[0] ?? null)}
                />
                {postPreview && postFile && (
                  postFile.type === 'video/mp4' ? (
                    <video src={postPreview} controls playsInline style={{ width: '100%', maxHeight: 250, objectFit: 'contain' }} />
                  ) : (
                    <img src={postPreview} alt="Aperçu de la publication" style={{ width: '100%', maxHeight: 250, objectFit: 'contain' }} />
                  )
                )}
                <textarea
                  placeholder="Écris une légende..."
                  rows={4}
                  maxLength={2000}
                  value={postCaption}
                  onChange={event => setPostCaption(event.target.value)}
                />
                <div style={{ padding: '14px', background: '#24252e', borderRadius: 12, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Confidentialité de la publication</h3>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
                    <span><strong>Masquer le nombre de J’aime</strong><small style={{ display: 'block', color: '#a4a4ad', marginTop: 4 }}>Les autres ne verront pas le compteur.</small></span>
                    <input type="checkbox" checked={hideLikeCount} onChange={event => setHideLikeCount(event.target.checked)} disabled={publishBusy} />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <span><strong>Désactiver les commentaires</strong><small style={{ display: 'block', color: '#a4a4ad', marginTop: 4 }}>Personne ne pourra commenter.</small></span>
                    <input type="checkbox" checked={commentsDisabled} onChange={event => setCommentsDisabled(event.target.checked)} disabled={publishBusy} />
                  </label>
                </div>
                {publishError && <p role="alert" style={{ color: '#ff7777', fontSize: 13 }}>{publishError}</p>}
                <button className="publish-button" type="submit" disabled={publishBusy || !postFile}>
                  {publishBusy ? 'Publication en cours...' : 'Publier'}
                </button>
                <button className="creation-back" type="button" disabled={publishBusy} onClick={() => setCreationType(null)}>
                  Retour aux choix
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
