import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase, type SleepPlanAuthorType } from '../lib/supabase'
import {
  addSessionComment,
  archiveSleepPlan,
  createSleepPlan,
  getCurrentUserId,
  getOrCreateTrainerConversation,
  inviteTrainerByEmail,
  isFamilyAdmin,
  listAccessibleBabies,
  listRecentSleepSessions,
  listSessionComments,
  listSleepPlans,
  listTrainerClientFamilies,
  listTrainerMessages,
  listTrainersForFamily,
  removeAssignment,
  requestClientAccess,
  sendTrainerMessage,
  updateAssignmentStatus,
  type Baby,
  type SleepPlan,
  type SleepSession,
  type SleepSessionComment,
  type SleepTrainer,
  type TrainerClientFamily,
  type TrainerMessage,
} from '../services/sleepTrainerControls'
import './TrainerDashboardPage.css'

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function linesToInstructions(value: string): { title: string; body: string }[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ title: `Step ${index + 1}`, body: line }))
}

export default function TrainerDashboardPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [babies, setBabies] = useState<Baby[]>([])
  const [selectedBabyId, setSelectedBabyId] = useState<string | null>(null)
  const selectedBaby = useMemo(
    () => babies.find((baby) => baby.id === selectedBabyId) ?? babies[0] ?? null,
    [babies, selectedBabyId],
  )

  const [familyAdmin, setFamilyAdmin] = useState(false)
  const [trainers, setTrainers] = useState<SleepTrainer[]>([])
  const [trainerClients, setTrainerClients] = useState<TrainerClientFamily[]>([])
  const [sessions, setSessions] = useState<SleepSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null,
    [sessions, selectedSessionId],
  )
  const [comments, setComments] = useState<SleepSessionComment[]>([])
  const [plans, setPlans] = useState<SleepPlan[]>([])

  const [trainerInviteEmail, setTrainerInviteEmail] = useState('')
  const [familyAccessCode, setFamilyAccessCode] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [planTitle, setPlanTitle] = useState('')
  const [planSummary, setPlanSummary] = useState('')
  const [planInstructions, setPlanInstructions] = useState('')

  const [messageTarget, setMessageTarget] = useState<{ label: string; baby: Baby; trainerId: string } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TrainerMessage[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
      setUserEmail(data.session?.user.email ?? null)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
      setUserEmail(session?.user.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadDashboard = useCallback(async () => {
    const currentUserId = await getCurrentUserId()
    if (!currentUserId) return
    setBusy(true)
    setError(null)
    try {
      const [babyRows, clientRows] = await Promise.all([
        listAccessibleBabies(currentUserId),
        listTrainerClientFamilies(currentUserId),
      ])
      setBabies(babyRows)
      setTrainerClients(clientRows)
      if (!selectedBabyId && babyRows.length > 0) setSelectedBabyId(babyRows[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trainer controls.')
    } finally {
      setBusy(false)
    }
  }, [selectedBabyId])

  useEffect(() => {
    if (userId) void loadDashboard()
  }, [loadDashboard, userId])

  const loadBabyControls = useCallback(async () => {
    if (!selectedBaby || !userId) {
      setFamilyAdmin(false)
      setTrainers([])
      setSessions([])
      setComments([])
      setPlans([])
      return
    }
    setBusy(true)
    setError(null)
    try {
      const [admin, trainerRows, sessionRows, planRows] = await Promise.all([
        isFamilyAdmin(selectedBaby.familyId, userId),
        listTrainersForFamily(selectedBaby.familyId),
        listRecentSleepSessions(selectedBaby.id),
        listSleepPlans(selectedBaby.id),
      ])
      setFamilyAdmin(admin)
      setTrainers(trainerRows)
      setSessions(sessionRows)
      setPlans(planRows)
      setSelectedSessionId((current) => current ?? sessionRows[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load selected baby controls.')
    } finally {
      setBusy(false)
    }
  }, [selectedBaby, userId])

  useEffect(() => {
    void loadBabyControls()
  }, [loadBabyControls])

  const loadComments = useCallback(async () => {
    if (!selectedSession) {
      setComments([])
      return
    }
    setComments(await listSessionComments(selectedSession.id))
  }, [selectedSession])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setMessages(await listTrainerMessages(conversationId))
  }, [conversationId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  const startMessageThread = async (baby: Baby, trainerId: string, label: string) => {
    setBusy(true)
    try {
      const nextConversationId = await getOrCreateTrainerConversation(baby, trainerId)
      setConversationId(nextConversationId)
      setMessageTarget({ baby, trainerId, label })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open message thread.')
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (loginError) setError(loginError.message)
  }

  const handleInviteTrainer = async () => {
    if (!selectedBaby || !userId) return
    await inviteTrainerByEmail(selectedBaby.familyId, trainerInviteEmail, userId)
    setTrainerInviteEmail('')
    await loadBabyControls()
  }

  const handleRequestAccess = async () => {
    if (!userId) return
    await requestClientAccess(familyAccessCode, userId)
    setFamilyAccessCode('')
    await loadDashboard()
  }

  const handleAddComment = async () => {
    if (!selectedSession || !userId || !commentBody.trim()) return
    await addSessionComment(selectedSession.id, userId, commentBody)
    setCommentBody('')
    await loadComments()
  }

  const handleSendMessage = async () => {
    if (!conversationId || !userId || !messageBody.trim()) return
    await sendTrainerMessage(conversationId, userId, messageBody)
    setMessageBody('')
    await loadMessages()
  }

  const handleCreatePlan = async () => {
    if (!selectedBaby || !userId || !planTitle.trim()) return
    const authorType: SleepPlanAuthorType = familyAdmin ? 'family' : 'trainer'
    await createSleepPlan({
      babyId: selectedBaby.id,
      authorId: userId,
      authorType,
      title: planTitle,
      summary: planSummary,
      instructions: linesToInstructions(planInstructions),
    })
    setPlanTitle('')
    setPlanSummary('')
    setPlanInstructions('')
    setPlans(await listSleepPlans(selectedBaby.id))
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="trainer-page trainer-page-center">
        <section className="trainer-card trainer-auth-card">
          <h1>Sleep trainer controls</h1>
          <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable the web dashboard.</p>
          <Link to="/">Back to Sova</Link>
        </section>
      </main>
    )
  }

  if (authLoading) {
    return <main className="trainer-page trainer-page-center">Loading...</main>
  }

  if (!userId) {
    return (
      <main className="trainer-page trainer-page-center">
        <form className="trainer-card trainer-auth-card" onSubmit={handleLogin}>
          <p className="trainer-eyebrow">Sova web dashboard</p>
          <h1>Sleep trainer controls</h1>
          <p>Sign in with your Sova account to manage trainer access, client messages, comments, and plans.</p>
          {error ? <div className="trainer-alert">{error}</div> : null}
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          <button className="trainer-primary" disabled={busy} type="submit">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          <Link to="/">Back to Sova</Link>
        </form>
      </main>
    )
  }

  return (
    <main className="trainer-page">
      <header className="trainer-dashboard-header">
        <div>
          <p className="trainer-eyebrow">Sova web dashboard</p>
          <h1>Sleep trainer controls</h1>
          <p>Signed in as {userEmail ?? 'Sova user'}</p>
        </div>
        <div className="trainer-header-actions">
          <Link to="/">Home</Link>
          <button className="trainer-secondary" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <div className="trainer-alert">{error}</div> : null}
      {busy ? <div className="trainer-muted">Syncing...</div> : null}

      <section className="trainer-card">
        <div className="trainer-section-heading">
          <div>
            <h2>Current baby</h2>
            <p>Choose the baby whose trainer controls you want to manage.</p>
          </div>
          <button className="trainer-secondary" onClick={() => void loadDashboard()}>
            Refresh
          </button>
        </div>
        {babies.length === 0 ? (
          <p className="trainer-muted">No accessible babies yet. Request access below if you are a trainer.</p>
        ) : (
          <select value={selectedBaby?.id ?? ''} onChange={(event) => setSelectedBabyId(event.target.value)}>
            {babies.map((baby) => (
              <option key={baby.id} value={baby.id}>
                {baby.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <div className="trainer-dashboard-grid">
        <section className="trainer-card">
          <div className="trainer-section-heading">
            <div>
              <h2>Family trainer access</h2>
              <p>Invite trainers or approve access requests for this baby's family.</p>
            </div>
            {selectedBaby ? <span className="trainer-code">{selectedBaby.familyId}</span> : null}
          </div>
          {!selectedBaby ? (
            <p className="trainer-muted">Select a baby to manage family trainer access.</p>
          ) : (
            <>
              {familyAdmin ? (
                <div className="trainer-inline-form">
                  <input
                    value={trainerInviteEmail}
                    onChange={(event) => setTrainerInviteEmail(event.target.value)}
                    placeholder="Trainer email"
                    type="email"
                  />
                  <button className="trainer-primary" disabled={!trainerInviteEmail.trim()} onClick={() => void handleInviteTrainer()}>
                    Invite
                  </button>
                </div>
              ) : (
                <p className="trainer-muted">Only family admins can invite, approve, or remove trainers.</p>
              )}
              <div className="trainer-list">
                {trainers.length === 0 ? <p className="trainer-muted">No trainers yet.</p> : null}
                {trainers.map((trainer) => (
                  <article className="trainer-list-item" key={trainer.assignmentId}>
                    <div>
                      <strong>{trainer.name}</strong>
                      <span>{trainer.email ?? trainer.trainerType}</span>
                    </div>
                    <span className={`trainer-pill trainer-pill-${trainer.status}`}>{trainer.status}</span>
                    <div className="trainer-list-actions">
                      {trainer.status === 'pending' && trainer.invitedByRole === 'trainer' && familyAdmin ? (
                        <>
                          <button onClick={() => void updateAssignmentStatus(trainer.assignmentId, 'accepted').then(loadBabyControls)}>
                            Approve
                          </button>
                          <button onClick={() => void updateAssignmentStatus(trainer.assignmentId, 'declined').then(loadBabyControls)}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {trainer.status === 'accepted' && selectedBaby ? (
                        <button onClick={() => void startMessageThread(selectedBaby, trainer.id, trainer.name)}>Message</button>
                      ) : null}
                      {familyAdmin ? <button onClick={() => void removeAssignment(trainer.assignmentId).then(loadBabyControls)}>Remove</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="trainer-card">
          <div className="trainer-section-heading">
            <div>
              <h2>Trainer clients</h2>
              <p>Request access with a family code and message approved clients.</p>
            </div>
          </div>
          <div className="trainer-inline-form">
            <input
              value={familyAccessCode}
              onChange={(event) => setFamilyAccessCode(event.target.value)}
              placeholder="Family access code"
            />
            <button className="trainer-primary" disabled={!familyAccessCode.trim()} onClick={() => void handleRequestAccess()}>
              Request
            </button>
          </div>
          <div className="trainer-list">
            {trainerClients.length === 0 ? <p className="trainer-muted">No client families yet.</p> : null}
            {trainerClients.map((client) => (
              <article className="trainer-list-item" key={client.assignmentId}>
                <div>
                  <strong>{client.familyName ?? `Family ${client.familyId.slice(0, 8)}`}</strong>
                  <span>{client.babies.map((baby) => baby.name).join(', ') || 'Waiting for approval'}</span>
                </div>
                <span className={`trainer-pill trainer-pill-${client.status}`}>{client.status}</span>
                {client.status === 'accepted' && client.babies[0] ? (
                  <button onClick={() => void startMessageThread(client.babies[0], userId, client.familyName ?? client.babies[0].name)}>
                    Message
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="trainer-card">
          <div className="trainer-section-heading">
            <div>
              <h2>Session comments</h2>
              <p>Leave guidance on a specific sleep session.</p>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="trainer-muted">No recent sessions for this baby.</p>
          ) : (
            <>
              <select value={selectedSession?.id ?? ''} onChange={(event) => setSelectedSessionId(event.target.value)}>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.type} - {formatDateTime(session.startTime)}
                  </option>
                ))}
              </select>
              <div className="trainer-comment-list">
                {comments.length === 0 ? <p className="trainer-muted">No comments on this session yet.</p> : null}
                {comments.map((comment) => (
                  <article className="trainer-comment" key={comment.id}>
                    <p>{comment.body}</p>
                    <span>{formatDateTime(comment.createdAt)}</span>
                  </article>
                ))}
              </div>
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add instruction, observation, or follow-up..."
              />
              <button className="trainer-primary" disabled={!commentBody.trim()} onClick={() => void handleAddComment()}>
                Add comment
              </button>
            </>
          )}
        </section>

        <section className="trainer-card">
          <div className="trainer-section-heading">
            <div>
              <h2>Messages</h2>
              <p>{messageTarget ? `Thread with ${messageTarget.label}` : 'Open a trainer or client thread to start messaging.'}</p>
            </div>
          </div>
          <div className="trainer-message-list">
            {messages.length === 0 ? <p className="trainer-muted">No messages selected.</p> : null}
            {messages.map((message) => (
              <article className={`trainer-message ${message.senderId === userId ? 'trainer-message-own' : ''}`} key={message.id}>
                <p>{message.body}</p>
                <span>{formatDateTime(message.createdAt)}</span>
              </article>
            ))}
          </div>
          <textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder="Write a message..."
            disabled={!conversationId}
          />
          <button className="trainer-primary" disabled={!conversationId || !messageBody.trim()} onClick={() => void handleSendMessage()}>
            Send message
          </button>
        </section>

        <section className="trainer-card trainer-card-wide">
          <div className="trainer-section-heading">
            <div>
              <h2>Sleep plans</h2>
              <p>Create a plan for the selected baby and archive old active plans.</p>
            </div>
          </div>
          <div className="trainer-plan-form">
            <input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} placeholder="Plan title" />
            <input value={planSummary} onChange={(event) => setPlanSummary(event.target.value)} placeholder="Summary" />
            <textarea
              value={planInstructions}
              onChange={(event) => setPlanInstructions(event.target.value)}
              placeholder="Instructions, one per line"
            />
            <button className="trainer-primary" disabled={!selectedBaby || !planTitle.trim()} onClick={() => void handleCreatePlan()}>
              Save active plan
            </button>
          </div>
          <div className="trainer-plan-list">
            {plans.length === 0 ? <p className="trainer-muted">No sleep plans yet.</p> : null}
            {plans.map((plan) => (
              <article className="trainer-plan" key={plan.id}>
                <div>
                  <strong>{plan.title}</strong>
                  <span>{plan.summary || `${plan.authorType} plan`}</span>
                </div>
                <span className={`trainer-pill trainer-pill-${plan.status}`}>{plan.status}</span>
                {plan.status === 'active' ? (
                  <button onClick={() => void archiveSleepPlan(plan.id).then(() => selectedBaby && listSleepPlans(selectedBaby.id).then(setPlans))}>
                    Archive
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
