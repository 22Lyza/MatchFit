
import { useState } from 'react'

type Page = 'accueil' | 'decouvrir' | 'activites' | 'profil'

function App() {
  const [page, setPage] = useState<Page>('accueil')
  const [liked, setLiked] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">
          MATCH<span>FIT</span>
        </h1>
        <button
          className="top-action"
          aria-label="Notifications"
          onClick={() => alert('Notifications à venir')}
        >
          ♡
        </button>
      </header>

      {page === 'accueil' && (
        <section className="home">
          <div className="stories">
            {['Ma story', 'Emma', 'Lucas', 'Clara'].map(
              (name, index) => (
                <div className="story" key={name}>
                  <div className="story-avatar">
                    {index === 0 ? '+' : name[0]}
                  </div>
                  <span>{name}</span>
                </div>
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
              <button
                onClick={() => alert('Commentaires à venir')}
              >
                ♧ 12
              </button>
              <button
                onClick={() => alert('Partage à venir')}
              >
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
          <p>Explore les sportifs de la communauté.</p>
        </section>
      )}

      {page === 'activites' && (
        <section className="placeholder-page">
          <h2>Mes activités</h2>
          <p>
            Retrouve bientôt tes courses, entraînements
            et performances.
          </p>
        </section>
      )}

      {page === 'profil' && (
        <section className="placeholder-page">
          <h2>Mon profil</h2>
          <p>Ton espace sportif personnel.</p>
        </section>
      )}

      <nav className="bottom-nav">
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
          className="create-button"
          onClick={() => alert('Création à venir')}
          aria-label="Créer une publication"
        >
          +
        </button>

        <button
          className={page === 'activites' ? 'active' : ''}
          onClick={() => setPage('activites')}
        >
          <span>▥</span>
          Activités
        </button>

        <button
          className={page === 'profil' ? 'active' : ''}
          onClick={() => setPage('profil')}
        >
          <span>♙</span>
          Profil
        </button>
      </nav>
    </div>
  )
}

export default App
