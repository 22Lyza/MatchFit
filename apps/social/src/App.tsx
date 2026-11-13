
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
  const [settingsSection, setSettingsSection] = useState<'accueil' | 'archives' | 'confidentialite' | 'securite' | 'conditions' | 'donnees'>('accueil')
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({})
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>({})
  const [postMenu, setPostMenu] = useState<string | null>(null)
  const [reportPost, setReportPost] = useState<{ id: string; author: string; demo: boolean } | null>(null)
  const [reportReason, setReportReason] = useState('Spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [comments, setComments] = useState<Record<string, string[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
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
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [sportsText, setSportsText] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)

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
        .select('id, user_id, caption, media_url, media_type, created_at, hide_like_count, comments_disabled')
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

  function toggleLike(postId: string) {
    setLikedPosts(current => ({ ...current, [postId]: !current[postId] }))
  }

  function submitComment(postId: string) {
    const value = (commentDrafts[postId] || '').trim()
    if (!value) return
    setComments(current => ({ ...current, [postId]: [...(current[postId] || []), value] }))
    setCommentDrafts(current => ({ ...current, [postId]: '' }))

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

  function commentHeart(postId: string, index: number) {
    const key = `${postId}:${index}`
    const liked = !!likedComments[key]
    return (
      <button type="button" aria-label={liked ? 'Ne plus aimer ce commentaire' : 'Aimer ce commentaire'}
        aria-pressed={liked} onClick={() => setLikedComments(current => ({ ...current, [key]: !current[key] }))}
        style={{ flexShrink: 0, background: 'transparent', border: 'none', padding: '6px',
          color: liked ? '#ff6558' : '#a4a4ad', cursor: 'pointer', fontSize: 20 }}>
        <ModernHeart filled={liked} size={19} />
      </button>
    )
  }

  function postInteractions(postId: string, caption: string, authorName: string, mediaUrl?: string, hideLikeCount = false, commentsOff = false) {
    const existing = demoComments[postId] || []
    const added = comments[postId] || []
    const total = existing.length + added.length
    return (
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <button type="button" onClick={() => toggleLike(postId)} aria-label={likedPosts[postId] ? 'Retirer le like' : 'Aimer'}
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
        {!hideLikeCount && <p style={{ margin: '5px 0 8px', fontSize: 13, fontWeight: 700 }}>{likedPosts[postId] ? '1 J’aime' : '0 J’aime'}</p>}
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
            {[...existing, ...added.map(text => ({ name: 'Moi', text }))].slice(0, 3).map((comment, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0', fontSize: 13, color: '#e6e6e9' }}>
                <span style={{ flex: 1 }}><strong>{comment.name}</strong> {comment.text}</span>
                {commentHeart(postId, index)}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  function renderPost(post: SocialPost) {
    const author = authors[post.user_id]
    const authorName = author?.first_name || author?.username || 'Sportif MatchFit'
    return (
      <article className="post" key={post.id}>
        <div className="post-header" style={{ paddingLeft: 16, paddingRight: 16 }}>
          <div className="avatar" style={{ overflow: 'hidden' }}>
            {author?.avatar_url ? (
              <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : authorName[0].toUpperCase()}
          </div>
          <div>
            <strong>{authorName}</strong>
            <p>{new Date(post.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {post.user_id !== session?.user.id && postOptions(post.id, authorName, false)}
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
          {!postsLoading && posts.filter(post => post.user_id !== session.user.id).length === 0 && !postsError && (
            <div style={cardStyle}>
              <p>Aucune publication des autres sportifs pour le moment.</p>
            </div>
          )}
          {posts.filter(post => post.user_id !== session.user.id).map(renderPost)}

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
            <article className="post" key={example.name + '-demo'}>
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
                      onClick={() => setSelectedPost(post)}
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
            {[...(demoComments[commentModal.id] || []), ...(comments[commentModal.id] || []).map(text => ({ name: 'Moi', text }))].map((comment, index) => (
              <div key={index} style={{ display: 'flex', gap: 12, marginBottom: 22, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#30313b', color: '#ff8a4b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}>
                  {comment.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 14, lineHeight: 1.5, flex: 1 }}><strong>{comment.name}</strong> {comment.text}</p>
                {commentHeart(commentModal.id, index)}
              </div>
            ))}
            {(demoComments[commentModal.id] || []).length === 0 && (comments[commentModal.id] || []).length === 0 && (
              <p style={{ textAlign: 'center', color: '#a4a4ad', marginTop: 40 }}>Aucun commentaire pour le moment.</p>
            )}
          </div>
          <form onSubmit={event => { event.preventDefault(); submitComment(commentModal.id) }}
            style={{ display: 'flex', gap: 8, padding: '14px 18px max(18px, env(safe-area-inset-bottom))', borderTop: '1px solid #30313b', background: '#17181f', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
            <input aria-label="Ton commentaire" placeholder="Ajouter un commentaire..."
              value={commentDrafts[commentModal.id] || ''}
              onChange={event => setCommentDrafts(current => ({ ...current, [commentModal.id]: event.target.value }))}
              style={{ ...fieldStyle, margin: 0, minWidth: 0, flex: 1, padding: 12 }} />
            <button type="submit" disabled={!(commentDrafts[commentModal.id] || '').trim()}
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

      {selectedPost && (
        <div className="creation-overlay" onClick={() => setSelectedPost(null)}>
          <div className="creation-panel" onClick={event => event.stopPropagation()}>
            <div className="creation-header">
              <h2>Ma publication</h2>
              <button className="creation-close" onClick={() => setSelectedPost(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={{ padding: 14 }}>
              {selectedPost.media_type === 'video' ? (
                <video src={selectedPost.media_url} controls playsInline style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
              ) : (
                <img src={selectedPost.media_url} alt={selectedPost.caption || 'Ma publication'}
                  style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
              )}
              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedPost.caption}</p>
              <div style={{ borderTop: '1px solid #30313b', paddingTop: 16, marginTop: 18 }}>
                <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Confidentialité de cette publication</h3>
                <label style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', padding: '10px 0', cursor: 'pointer' }}>
                  <span>Masquer le nombre de J’aime</span>
                  <input type="checkbox" checked={selectedPost.hide_like_count} disabled={postSettingsBusy}
                    onChange={event => void updatePostPrivacy(selectedPost, { hide_like_count: event.target.checked })} />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', padding: '10px 0', cursor: 'pointer' }}>
                  <span>Désactiver les commentaires</span>
                  <input type="checkbox" checked={selectedPost.comments_disabled} disabled={postSettingsBusy}
                    onChange={event => void updatePostPrivacy(selectedPost, { comments_disabled: event.target.checked })} />
                </label>
                {postSettingsError && <p role="alert" style={{ color: '#ff7777', fontSize: 13 }}>{postSettingsError}</p>}
              </div>
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
