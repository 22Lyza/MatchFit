
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, TouchEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Page =
  | 'accueil'
  | 'decouvrir'
  | 'activites'
  | 'messages'
  | 'profil'

type CreationType = 'story' | 'publication'
type AuthMode = 'connexion' | 'inscription' | 'oubli'

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid #30313b',
  background: '#24252e',
  color: '#fff',
  fontSize: '14px',
  marginTop: '7px',
  marginBottom: '16px'
}

const primaryStyle: CSSProperties = {
  width: '100%',
  padding: '15px',
  border: 'none',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #ff6558, #ff8a4b)',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer'
}

const linkStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ff8a4b',
  padding: '10px',
  fontSize: '13px',
  cursor: 'pointer'
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
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
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
      <path d="M9.9 5.3A10.8 10.8 0 0112 5c5 0 9 4 10 7a12.6 12.6 0 01-3.2 4.5" />
      <path d="M6.3 6.3C4.2 7.7 2.7 9.8 2 12c1 3 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" />
    </svg>
  ) : (
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function App() {
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
  const [liked, setLiked] = useState(false)
  const [creationOpen, setCreationOpen] = useState(false)
  const [creationType, setCreationType] =
    useState<CreationType | null>(null)

  const touchStart = useRef<{ x: number; y: number } | null>(null)

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
        if (active) {
          setAuthError('Impossible de vérifier la connexion.')
          setAuthLoading(false)
        }
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
              'Cette adresse e-mail possède déjà un compte MatchFit. ' +
              'Connecte-toi pour continuer.'
            )
            setShowLoginSuggestion(true)
            return
          }

          throw error
        }

        if (!data.session) {
          setAuthMessage(
            "Si cette adresse peut être inscrite, " +
            "tu recevras un e-mail de confirmation. " +
            "Vérifie aussi tes spams. " +
            "Si tu possèdes déjà un compte, connecte-toi."
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
          'Si cette adresse possède un compte, ' +
          'tu recevras un e-mail de réinitialisation.'
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

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStart.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = null

    if (!start || page !== 'accueil' || creationOpen) return

    const deltaX = event.changedTouches[0].clientX - start.x
    const deltaY = event.changedTouches[0].clientY - start.y

    if (
      deltaX > 90 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    ) {
      setCreationType(null)
      setCreationOpen(true)
    }
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

        <main style={{
          maxWidth: 390,
          margin: '55px auto',
          padding: '25px',
          border: '1px solid #30313b',
          borderRadius: 24,
          background: '#17181f'
        }}>
          <h2 style={{
            textAlign: 'center',
            marginTop: 0
          }}>
            {authMode === 'connexion'
              ? 'Bienvenue sur MatchFit'
              : authMode === 'inscription'
                ? 'Rejoins MatchFit'
                : 'Mot de passe oublié'}
          </h2>

          <p style={{
            textAlign: 'center',
            color: '#a4a4ad',
            fontSize: 13,
            marginBottom: 25
          }}>
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
                      paddingRight: '55px'
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
                onClick={() => changeAuthMode('connexion')}
                style={{
                  ...linkStyle,
                  display: 'block',
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

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 15
          }}>
            {authMode === 'connexion' ? (
              <>
                <button
                  style={linkStyle}
                  onClick={() => changeAuthMode('oubli')}
                >
                  Mot de passe oublié ?
                </button>

                <button
                  style={linkStyle}
                  onClick={() => changeAuthMode('inscription')}
                >
                  Pas encore de compte ? Inscris-toi
                </button>
              </>
            ) : (
              <button
                style={linkStyle}
                onClick={() => changeAuthMode('connexion')}
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
            onClick={() =>
              alert('Notifications à venir')
            }
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
              <button
                onClick={() => setLiked(!liked)}
                aria-label="J'aime"
              >
                {liked ? '❤️' : '♡'} {liked ? 129 : 128}
              </button>

              <button
                onClick={() =>
                  alert('Commentaires à venir')
                }
                aria-label="Commentaires"
              >
                ♧ 12
              </button>

              <button
                onClick={() =>
                  alert('Partage à venir')
                }
                aria-label="Partager"
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
          <p>
            Explore les sportifs de la communauté MatchFit.
          </p>
        </section>
      )}

      {page === 'activites' && (
        <section className="placeholder-page">
          <h2>Mes activités</h2>
          <p>
            Retrouve tes courses, entraînements
            et performances sportives.
          </p>
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
          <h2>Mon profil</h2>
          <p>Ton espace sportif personnel.</p>

          <div style={{
            marginTop: 25,
            padding: 20,
            background: '#17181f',
            borderRadius: 16,
            border: '1px solid #30313b'
          }}>
            <p style={{ overflowWrap: 'anywhere' }}>
              <strong>Compte :</strong> {session.user.email}
            </p>

            <button
              onClick={handleLogout}
              style={{
                ...primaryStyle,
                marginTop: 15
              }}
            >
              Se déconnecter
            </button>
          </div>
        </section>
      )}

      <nav
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
                <button
                  onClick={() =>
                    setCreationType('story')
                  }
                >
                  <span>◉</span>
                  <strong>Story</strong>
                  <small>Partage un moment sportif</small>
                </button>

                <button
                  onClick={() =>
                    setCreationType('publication')
                  }
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
                      'La publication réelle sera disponible ' +
                      "après l'intégration à Supabase."
                    )
                  }
                >
                  Publier
                </button>

                <button
                  className="creation-back"
                  onClick={() =>
                    setCreationType(null)
                  }
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
