
import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'

type Page =
  | 'accueil'
  | 'decouvrir'
  | 'activites'
  | 'messages'
  | 'profil'

type CreationType = 'story' | 'publication'

function App() {
  const [page, setPage] = useState<Page>('accueil')
  const [liked, setLiked] = useState(false)
  const [creationOpen, setCreationOpen] = useState(false)
  const [creationType, setCreationType] =
    useState<CreationType | null>(null)

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStart.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!touchStart.current || page !== 'accueil') return

    const deltaX =
      event.changedTouches[0].clientX - touchStart.current.x
    const deltaY =
      event.changedTouches[0].clientY - touchStart.current.y

    touchStart.current = null

    if (deltaX > 90 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      setCreationType(null)
      setCreationOpen(true)
    }
  }

  function openCreation(type: CreationType | null = null) {
    setCreationType(type)
    setCreationOpen(true)
  }

  return (
    <div
      className="app"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <header className="topbar">
        <h1 className="logo">
          MATCH<span>FIT</span>
        </h1>

        <div className="topbar-actions">
          <button
            className="top-action"
            aria-label="Créer du contenu"
            onClick={() => openCreation()}
          >
            +
          </button>

          <button
            className="top-action"
            aria-label="Notifications"
            onClick={() => alert('Notifications à venir')}
          >
            ♡
          </button>
        </div>
      </header>

      {page === 'accueil' && (
        <section className="home">
          <div className="stories">
            {['Ma story', 'Emma', 'Lucas', 'Clara'].map(
              (name, index) => (
                <button
                  className="story"
                  key={name}
                  onClick={() =>
                    index === 0
                      ? openCreation('story')
                      : alert('Stories à venir')
                  }
                >
                  <div className="story-avatar">
                    {index === 0 ? '+' : name[0]}
                  </div>
                  <span>{name}</span>
                </button>
              )
            )}
          </div>

          <div className="feed-title">
            <h2>Ton fil d'actualité</h2>
            <span>Sport & communauté</span>
          </div>

          <article className="post">
            <div className="post-header">
              <div className="avatar">E</div>
              <div>
                <strong>Emma</strong>
                <p>Trail running • Aujourd'hui</p>
              </div>
            </div>

            <div className="post-photo">
              <span>🏔️</span>
              <h3>Chaque sommet compte.</h3>
              <p>18 km de trail en montagne</p>
            </div>

            <div className="post-actions">
              <button onClick={() => setLiked(!liked)}>
                {liked ? '❤️' : '♡'} {liked ? 129 : 128}
              </button>

              <button onClick={() => alert('Commentaires à venir')}>
                ♧ 12
              </button>

              <button onClick={() => alert('Partage à venir')}>
                ↗
              </button>
            </div>

            <div className="post-caption">
              <strong>Emma</strong> Une séance de plus 💪
              <p>#running #trail #matchfit</p>
            </div>
          </article>
        </section>
      )}

      {page === 'decouvrir' && (
        <section className="placeholder-page">
          <h2>Découvrir</h2>
          <p>Explore les sportifs de la communauté MatchFit.</p>
        </section>
      )}

      {page === 'activites' && (
        <section className="placeholder-page">
          <h2>Mes activités</h2>
          <p>
            Retrouve tes courses, entraînements et performances
            sportives.
          </p>
        </section>
      )}

      {page === 'messages' && (
        <section className="placeholder-page">
          <h2>Messages</h2>
          <p>Retrouve tes conversations avec les autres sportifs.</p>
        </section>
      )}

      {page === 'profil' && (
        <section className="placeholder-page">
          <h2>Mon profil</h2>
          <p>Ton espace sportif personnel.</p>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Navigation principale">
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
      </nav>

      {creationOpen && (
        <div className="creation-overlay">
          <div className="creation-panel">
            <div className="creation-header">
              <h2>
                {creationType === 'story'
                  ? 'Nouvelle story'
                  : creationType === 'publication'
                    ? 'Nouvelle publication'
                    : 'Créer sur MatchFit'}
              </h2>

              <button
                className="creation-close"
                onClick={() => {
                  setCreationOpen(false)
                  setCreationType(null)
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {creationType === null ? (
              <div className="creation-options">
                <button onClick={() => setCreationType('story')}>
                  <span>◉</span>
                  <strong>Story</strong>
                  <small>Partage un moment sportif</small>
                </button>

                <button
                  onClick={() => setCreationType('publication')}
                >
                  <span>▣</span>
                  <strong>Publication</strong>
                  <small>Photo, vidéo et performance</small>
                </button>
              </div>
            ) : (
              <div className="creation-form">
                <p>
                  {creationType === 'story'
                    ? 'Prépare ta prochaine story sportive.'
                    : 'Prépare ta prochaine publication sportive.'}
                </p>

                <label htmlFor="creation-media">
                  Ajouter une photo ou une vidéo
                </label>

                <input
                  id="creation-media"
                  type="file"
                  accept="image/*,video/*"
                />

                <textarea
                  placeholder="Écris une légende..."
                  rows={4}
                />

                <button
                  className="publish-button"
                  onClick={() =>
                    alert(
                      'La publication réelle sera disponible après la connexion à Supabase.'
                    )
                  }
                >
                  Publier
                </button>

                <button
                  className="creation-back"
                  onClick={() => setCreationType(null)}
                >
                  Retour aux choix
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
