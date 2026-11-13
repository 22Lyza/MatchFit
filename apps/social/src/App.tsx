
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, TouchEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Page = 'accueil' | 'decouvrir' | 'activites' | 'messages' | 'profil'
type CreationType = 'story' | 'publication'
type AuthMode = 'connexion' | 'inscription' | 'oubli'

type SocialPost = {
  id: string
  user_id: string
  caption: string
  media_url: string
  media_type: 'image' | 'video'
  created_at: string
}

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
}

const emptyProfile = (userId: string): SocialProfile => ({
  user_id: userId,
  first_name: '',
  username: null,
  city: '',
  sports: [],
  bio: '',
  avatar_url: null
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
  const [postPreview, setPostPreview] = useState<string | null>(null)

  const [profile, setProfile] = useState<SocialProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [sportsText, setSportsText] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

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
            'user_id, first_name, username, city, sports, bio, avatar_url'
          )
          .eq('user_id', userId)
          .maybeSingle()

        if (cancelled) return
        if (error) throw error

        const loaded =
          (data as SocialProfile | null) ?? emptyProfile(userId!)

        setProfile(loaded)
        setSportsText(loaded.sports.join(', '))
        setProfileEditing(!data)
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
        .select('id, user_id, caption, media_url, media_type, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const nextPosts = (data ?? []) as SocialPost[]
      setPosts(nextPosts)

      const userIds = [...new Set(nextPosts.map(post => post.user_id))]
      if (userIds.length) {
        const { data: people, error: peopleError } = await supabase
          .from('social_profiles')
          .select('user_id, first_name, username, avatar_url')
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
      } else {
        setAuthors({})
      }
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : 'Chargement impossible.')
    } finally {
      setPostsLoading(false)
    }
  }

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
        media_type: postFile.type === 'video/mp4' ? 'video' : 'image'
      })
      if (insertError) throw insertError

      setPostFile(null)
      setPostCaption('')
      setCreationOpen(false)
      setCreationType(null)
      setPage('accueil')
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
    setPublishError('')
  }

  function renderPost(post: SocialPost) {
    const author = authors[post.user_id]
    const authorName = author?.first_name || author?.username || 'Sportif MatchFit'
    return (
      <article className="post" key={post.id}>
        <div className="post-header">
          <div className="avatar" style={{ overflow: 'hidden' }}>
            {author?.avatar_url ? (
              <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : authorName[0].toUpperCase()}
          </div>
          <div>
            <strong>{authorName}</strong>
            <p>{new Date(post.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div style={{ width: '100%', background: '#101116', borderRadius: 12, overflow: 'hidden' }}>
          {post.media_type === 'video' ? (
            <video src={post.media_url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain' }} />
          ) : (
            <img src={post.media_url} alt={post.caption || 'Publication sportive'} style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain' }} />
          )}
        </div>
        {post.caption && (
          <div className="post-caption" style={{ whiteSpace: 'pre-wrap', paddingTop: 12 }}>
            <strong>{authorName}</strong> {post.caption}
          </div>
        )}
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

          {postsLoading && <p>Chargement des publications...</p>}
          {postsError && <p role="alert" style={{ color: '#ff7777' }}>{postsError}</p>}
          {!postsLoading && posts.length === 0 && !postsError && (
            <div style={cardStyle}>
              <p>Aucune publication pour le moment.</p>
              <button style={primaryStyle} onClick={() => openCreation('publication')}>
                Créer ma première publication
              </button>
            </div>
          )}
          {posts.map(renderPost)}
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
          <h2>Mon profil sportif</h2>
          <p>Ton espace sportif personnel.</p>

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
                    ['0', 'Activités'],
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

                {!profileEditing && (
                  <button
                    style={{
                      ...primaryStyle,
                      marginTop: 20
                    }}
                    onClick={() => {
                      setProfileEditing(true)
                      setProfileMessage('')
                      setProfileError('')
                    }}
                  >
                    ✎ Modifier mon profil
                  </button>
                )}
              </div>

              {profileEditing && (
                <form
                  onSubmit={saveProfile}
                  style={cardStyle}
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

              <div style={cardStyle}>
                <h3 style={{ margin: 0, fontSize: 15 }}>▦ Mes publications</h3>
                {postsLoading && <p>Chargement...</p>}
                {!postsLoading && posts.filter(post => post.user_id === session.user.id).length === 0 && (
                  <p style={{ textAlign: 'center', color: '#a4a4ad', fontSize: 13, marginTop: 25 }}>
                    Tu n'as pas encore de publications.
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, marginTop: 15 }}>
                  {posts.filter(post => post.user_id === session.user.id).map(post => (
                    <div key={post.id} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 8, background: '#24252e' }}>
                      {post.media_type === 'video' ? (
                        <video src={post.media_url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls />
                      ) : (
                        <img src={post.media_url} alt={post.caption || 'Ma publication'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div style={cardStyle}>
            <p
              style={{
                fontSize: 13,
                overflowWrap: 'anywhere'
              }}
            >
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
                <button className="creation-back" onClick={() => setCreationType(null)}>Retour aux choix</button>
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
