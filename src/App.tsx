import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clipboard, Clock3, Copy,
  Flame, Heart, LockKeyhole, RotateCcw, Sparkles, Users, Utensils, X,
} from 'lucide-react';
import {
  authenticateAnonymously, createFoodMoodSession, getFoodMoodMatches, getFoodMoodSessionState,
  acceptFoodMoodProposal, joinFoodMoodSession, MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName,
  proposeFoodMood, rejectFoodMoodProposal, startAnotherFoodMoodRound, submitFoodMoodReactions,
  type FoodMoodMatch, type FoodMoodRoundStart, type FoodMoodState, type Reaction,
} from '@/lib/foodmood-api';
import { buildJoinUrl, copyJoinCode, copyTextToClipboard, readJoinCodeFromSearch } from '@/lib/share';
import {
  formatDecidedBy, groupMatchesByTier, PARTNER_FALLBACK_NAME,
  resolveFlowOutcome, resolveProposalView, type ProposalView,
} from '@/lib/session-flow';

type Screen = 'home' | 'join' | 'waiting' | 'rating' | 'wait' | 'reveal' | 'chosen';
type FoodOption = { id: string; name: string; emoji: string; description: string; color: string };

type Match = FoodOption & { tier: FoodMoodMatch['tier'] };

const POLL_INTERVAL_MS = 2000;

/** Screens where the server is the source of truth and polling must stay active. */
const LIVE_SCREENS: ReadonlySet<Screen> = new Set(['waiting', 'wait', 'reveal', 'chosen']);

const ACTIVE_SESSION_KEY = 'foodmood:active-session';

const foods: FoodOption[] = [
  { id: 'pizza', name: 'Pizza', emoji: '🍕', description: 'Crispy, cheesy and always a good idea.', color: 'coral' },
  { id: 'chinese', name: 'Chinese', emoji: '🥡', description: 'Big flavors, little bites and something for everyone.', color: 'sky' },
  { id: 'indian', name: 'Indian', emoji: '🍛', description: 'Warm spices, fragrant rice and seriously good sides.', color: 'gold' },
  { id: 'sushi', name: 'Sushi', emoji: '🍣', description: 'Fresh rolls, crisp textures and a little bit fancy.', color: 'mint' },
  { id: 'mexican', name: 'Mexican', emoji: '🌮', description: 'Tacos, tangy salsa and a table full of flavor.', color: 'coral' },
  { id: 'burgers', name: 'Burgers', emoji: '🍔', description: 'Juicy, messy and exactly what the mood ordered.', color: 'gold' },
  { id: 'healthy', name: 'Healthy', emoji: '🥗', description: 'Bright, fresh and feel-good without being boring.', color: 'mint' },
  { id: 'italian', name: 'Italian', emoji: '🍝', description: 'Twirl-worthy pasta and a little dolce vita.', color: 'sky' },
  { id: 'middle_eastern', name: 'Middle Eastern', emoji: '🧆', description: 'Creamy hummus, warm pita and punchy herbs.', color: 'gold' },
  { id: 'fried_chicken', name: 'Fried Chicken', emoji: '🍗', description: 'Golden, crunchy and best enjoyed with your hands.', color: 'coral' },
  { id: 'thai', name: 'Thai', emoji: '🍜', description: 'Sweet, sour, spicy and wonderfully slurpable.', color: 'mint' },
  { id: 'south_indian', name: 'South Indian', emoji: '🥞', description: 'Crisp dosa, coconut chutney and comfort in every bite.', color: 'sky' },
];

const foodImages: Record<string, string> = {
  pizza: 'https://images.pexels.com/photos/35759993/pexels-photo-35759993.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sushi: 'https://images.pexels.com/photos/19356323/pexels-photo-19356323.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  mexican: 'https://images.pexels.com/photos/5837188/pexels-photo-5837188.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
};

function foodKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Strict lookup used for match cards — never invents an option. */
function knownFoodOption(id: string): FoodOption | null {
  const key = foodKey(id);
  if (!key) return null;
  return foods.find((food) => foodKey(food.id) === key || foodKey(food.name) === key) ?? null;
}

/** Lenient lookup used for the final selection so a server id can never dead-end the UI. */
function resolveFoodOption(id: string | null): FoodOption | null {
  if (!id) return null;
  const known = knownFoodOption(id);
  if (known) return known;
  return {
    id,
    name: 'Tonight’s pick',
    emoji: '🍽️',
    description: 'Locked in by both of you.',
    color: 'coral',
  };
}

function validateDisplayName(value: string): string {
  const cleaned = normalizeDisplayName(value);
  if (!cleaned) return 'Add your name so your partner knows who’s joining.';
  if (cleaned.length < 2) return 'Please use at least 2 characters.';
  return '';
}

function nameInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'F';
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  // An invited person arrives with the session code prefilled from ?join=.
  const [joinCode, setJoinCode] = useState(() => readJoinCodeFromSearch(window.location.search));
  const [session, setSession] = useState<FoodMoodState | null>(null);
  const [position, setPosition] = useState(0);
  const [myReactions, setMyReactions] = useState<Record<string, Reaction>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [waitingNotice, setWaitingNotice] = useState('');
  const [shareNotice, setShareNotice] = useState('');

  const screenRef = useRef<Screen>(screen);
  const sessionRef = useRef<FoodMoodState | null>(session);
  const pendingSyncRef = useRef<Promise<FoodMoodState> | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const currentFood = foods[position];
  const sessionId = session?.sessionId ?? null;
  const roundNumber = session?.roundNumber ?? 1;
  const myName = session?.participantName || normalizeDisplayName(displayName);
  const partnerName = session?.partnerName || PARTNER_FALLBACK_NAME;
  const chosenFood = resolveFoodOption(selectedFoodId ?? session?.finalFoodOptionId ?? null);
  const isLiveScreen = LIVE_SCREENS.has(screen);
  const proposal = resolveProposalView(session);
  const inviteUrl = buildJoinUrl(session?.joinCode ?? '');
  // The raw partner name, so a pre-names session is distinguishable from the placeholder.
  const decidedBy = formatDecidedBy(session?.participantName ?? myName, session?.partnerName);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const beginRoundLocally = useCallback(() => {
    setPosition(0);
    setMyReactions({});
    setMatches([]);
    setSelectedFoodId(null);
    setWaitingNotice('');
    setError('');
  }, []);

  /**
   * `start_another_foodmood_round` returns only the new round identity, so the
   * result is merged into the existing session. Assigning its partial row to
   * `session` would wipe sessionId/joinCode/participantId to '' and silently
   * stop polling for this participant.
   */
  const applyRoundStart = useCallback((start: FoodMoodRoundStart) => {
    const current = sessionRef.current;
    if (!current) return;

    const merged: FoodMoodState = {
      ...current,
      roundId: start.roundId,
      roundNumber: start.roundNumber,
      bothFinished: false,
      finalFoodOptionId: null,
    };

    sessionRef.current = merged;
    setSession(merged);
  }, []);

  useEffect(() => {
    let active = true;
    authenticateAnonymously().then(() => {
      if (active) setAuthReady(true);
    }).catch((authFailure: unknown) => {
      if (active) setAuthError(authFailure instanceof Error ? authFailure.message : 'We could not start FoodMood. Please try again.');
    });
    return () => { active = false; };
  }, []);

  /**
   * Single source of truth for server state. Concurrent callers share one
   * in-flight request so a slow poll can never overwrite a fresher result
   * from an action handler. `force` bypasses the shared request.
   */
  const syncSession = useCallback(async (force = false): Promise<FoodMoodState> => {
    if (!sessionId) throw new Error('This FoodMood session is no longer active.');

    const inFlight = pendingSyncRef.current;
    if (inFlight && !force) return inFlight;

    const request = getFoodMoodSessionState(sessionId).then((next) => {
      sessionRef.current = next;
      setSession(next);
      if (next.finalFoodOptionId) setSelectedFoodId(next.finalFoodOptionId);
      return next;
    });

    pendingSyncRef.current = request;

    try {
      return await request;
    } finally {
      if (pendingSyncRef.current === request) pendingSyncRef.current = null;
    }
  }, [sessionId]);

  const loadMatches = useCallback(async (roundId: string): Promise<Match[]> => {
    const backendMatches = await getFoodMoodMatches(roundId);
    return backendMatches
      .map((match) => {
        const food = knownFoodOption(match.foodOptionId);
        return food ? { ...food, tier: match.tier } : null;
      })
      .filter((match): match is Match => match !== null);
  }, []);

  /**
   * Reconciles the local screen against freshly fetched server state.
   * Order matters: newest round wins, then a final selection, then the reveal.
   */
  const reconcile = useCallback(async (isCurrent: () => boolean): Promise<void> => {
    try {
      const previousRoundNumber = sessionRef.current?.roundNumber ?? null;
      const next = await syncSession();
      if (!isCurrent()) return;

      const outcome = resolveFlowOutcome(
        previousRoundNumber,
        next,
        screenRef.current
      );

      if (outcome === 'newRound') {
        beginRoundLocally();
        setScreen('rating');
        return;
      }

      if (outcome === 'final') {
        setSelectedFoodId(next.finalFoodOptionId);
        setWaitingNotice('');
        setError('');
        setScreen('chosen');
        return;
      }

      if (outcome === 'reveal') {
        const nextMatches = await loadMatches(next.roundId);
        if (!isCurrent()) return;
        setMatches(nextMatches);
        setWaitingNotice('');
        setError('');
        setScreen('reveal');
        return;
      }

      setWaitingNotice('');
    } catch {
      if (isCurrent() && screenRef.current === 'wait') {
        setWaitingNotice('Still waiting for the other participant. We will keep checking.');
      }
    }
  }, [syncSession, loadMatches, beginRoundLocally]);

  useEffect(() => {
    if (!sessionId || !isLiveScreen) return;

    let active = true;
    let pending: Promise<void> | null = null;

    const isCurrent = () => active;

    const poll = () => {
      if (pending) return;
      pending = reconcile(isCurrent).finally(() => { pending = null; });
    };

    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [sessionId, isLiveScreen, reconcile]);

  const persistActiveSession = useCallback((next: FoodMoodState) => {
    try {
      window.localStorage.setItem(
        ACTIVE_SESSION_KEY,
        JSON.stringify({ sessionId: next.sessionId, joinCode: next.joinCode })
      );
    } catch {
      // Storage can be unavailable (private mode); the session still works.
    }
  }, []);

  const clearActiveSession = useCallback(() => {
    try {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const leaveSession = useCallback(() => {
    clearActiveSession();
    pendingSyncRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setPosition(0);
    setMyReactions({});
    setMatches([]);
    setSelectedFoodId(null);
    setWaitingNotice('');
    setShareNotice('');
    setError('');
    setScreen('home');
  }, [clearActiveSession]);

  const flashNotice = useCallback((message: string) => {
    setShareNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setShareNotice('');
      noticeTimerRef.current = null;
    }, 2800);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  /** Copies the full invite link, including ?join=, not just the code. */
  const copyInviteLink = useCallback(async () => {
    if (!sessionRef.current?.joinCode) {
      setError('Your invite link is not ready yet.');
      return;
    }

    setError('');
    if (await copyTextToClipboard(inviteUrl)) flashNotice('Invite link copied ✓');
    else setError('We could not copy the invite link. Please copy it manually.');
  }, [flashNotice, inviteUrl]);

  /** Copies just the session join code. */
  const copyCode = useCallback(async () => {
    const code = sessionRef.current?.joinCode;
    if (!code) {
      setError('Your join code is not ready yet.');
      return;
    }

    setError('');
    if (await copyJoinCode(code)) flashNotice('Code copied ✓');
    else setError('We could not copy the code. Please share it another way.');
  }, [flashNotice]);

  // Re-attach to an in-flight session after a browser refresh.
  useEffect(() => {
    if (!authReady || authError) return;

    let active = true;
    let stored: { sessionId?: string } | null = null;

    try {
      const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
      stored = raw ? JSON.parse(raw) as { sessionId?: string } : null;
    } catch {
      stored = null;
    }

    const storedSessionId = stored?.sessionId;
    if (!storedSessionId) return;

    const restore = async () => {
      try {
        const next = await getFoodMoodSessionState(storedSessionId);
        if (!active) return;

        const reattached =
          next.sessionId === storedSessionId &&
          Boolean(next.sessionId) &&
          Boolean(next.participantId);

        if (!reattached) {
          clearActiveSession();
          return;
        }

        sessionRef.current = next;
        setSession(next);
        setSelectedFoodId(next.finalFoodOptionId);
        setPosition(0);
        setMyReactions({});
        setMatches([]);
        setError('');

        if (next.finalFoodOptionId) setScreen('chosen');
        else if (next.bothFinished) setScreen('reveal');
        else setScreen('waiting');
      } catch {
        if (active) clearActiveSession();
      }
    };

    void restore();

    return () => { active = false; };
  }, [authReady, authError, clearActiveSession]);

  const resolveName = (): string => {
    const cleaned = normalizeDisplayName(displayName);
    const problem = validateDisplayName(displayName);
    setNameError(problem);
    return problem ? '' : cleaned;
  };

  const startCreate = async () => {
    if (!authReady) return;
    const cleanedName = resolveName();
    if (!cleanedName) return;

    setBusy(true); setError('');
    try {
      const created = await createFoodMoodSession(cleanedName);
      sessionRef.current = created;
      setSession(created);
      beginRoundLocally();
      persistActiveSession(created);
      setScreen('waiting');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not create a FoodMood. Please try again.');
    } finally { setBusy(false); }
  };

  const startJoin = async () => {
    if (!authReady || !joinCode.trim()) return;
    const cleanedName = resolveName();
    if (!cleanedName) return;

    setBusy(true); setError('');
    try {
      const joined = await joinFoodMoodSession(joinCode, cleanedName);

      // join_foodmood_session omits join_code, so hydrate the authoritative row
      // before rendering the lobby; fall back to the partial join result.
      let hydrated = joined;
      try {
        hydrated = await getFoodMoodSessionState(joined.sessionId);
      } catch {
        // Keep the optimistic join result rather than failing the whole join.
      }

      sessionRef.current = hydrated;
      setSession(hydrated);
      beginRoundLocally();
      persistActiveSession(hydrated);
      setScreen('waiting');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not join this FoodMood. Please try again.');
    } finally { setBusy(false); }
  };

  const beginRating = () => {
    setError(''); setWaitingNotice(''); setPosition(0); setMyReactions({}); setScreen('rating');
  };

  const chooseReaction = async (reaction: Reaction) => {
    const nextReactions = { ...myReactions, [currentFood.id]: reaction };
    setMyReactions(nextReactions);
    if (position < foods.length - 1) {
      setPosition((current) => current + 1);
      return;
    }
    if (!session) return;
    setBusy(true); setError('');
    try {
      await submitFoodMoodReactions(session.roundId, nextReactions);
      setScreen('wait');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not save your choices. Please try again.');
    } finally { setBusy(false); }
  };

  /**
   * Step A/B — propose a shared match. This is a proposal, not a decision: the
   * partner still has to accept it. If the partner proposed a different match
   * first, their proposal wins and the refresh below surfaces it.
   */
  const proposeFood = async (food: FoodOption) => {
    if (!session) return;
    setBusy(true); setError('');
    try {
      await proposeFoodMood(session.roundId, food.id);
      await syncSession(true);
    } catch (failure: unknown) {
      try {
        const next = await syncSession(true);
        // A pending proposal from the partner supersedes our failed attempt.
        if (next.proposedFoodOptionId) return;
        throw failure;
      } catch (refreshFailure: unknown) {
        setError(refreshFailure instanceof Error ? refreshFailure.message : 'We could not propose that FoodMood. Please try again.');
      }
    } finally { setBusy(false); }
  };

  /** Step D — accept the partner's proposal and finalize the FoodMood. */
  const acceptProposal = async () => {
    if (!session?.proposedFoodOptionId) return;
    setBusy(true); setError('');
    try {
      await acceptFoodMoodProposal(session.roundId);
      const next = await syncSession(true);
      if (next.finalFoodOptionId) {
        setSelectedFoodId(next.finalFoodOptionId);
        setScreen('chosen');
      }
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not confirm the FoodMood. Please try again.');
      // A rejection elsewhere means the round moved on; let polling catch up.
      void syncSession(true).catch(() => {});
    } finally { setBusy(false); }
  };

  /** Step E — reject the partner's proposal and roll into the next round. */
  const rejectProposal = async () => {
    if (!session) return;
    const previousRound = session.roundNumber;
    setBusy(true); setError('');
    try {
      await rejectFoodMoodProposal(session.roundId);
      const next = await syncSession(true);
      if (next.roundNumber > previousRound) {
        beginRoundLocally();
        setScreen('rating');
      }
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not reject that pick. Please try again.');
      void syncSession(true).catch(() => {});
    } finally { setBusy(false); }
  };

  const startAnotherRound = async () => {
    if (!session) return;
    const previousRound = session.roundNumber;
    setBusy(true); setError('');
    try {
      applyRoundStart(await startAnotherFoodMoodRound(session.sessionId));
      beginRoundLocally();
      setScreen('rating');
    } catch (failure: unknown) {
      try {
        const refreshed = await syncSession(true);
        if (refreshed.roundNumber > previousRound) {
          beginRoundLocally();
          setScreen('rating');
        } else throw failure;
      } catch (refreshFailure: unknown) {
        setError(refreshFailure instanceof Error ? refreshFailure.message : 'We could not start another round yet. Please try again.');
      }
    } finally { setBusy(false); }
  };

  if (authError) return <div className="app-shell"><div className="app-frame"><main className="main-content"><ErrorState message={authError} onRetry={() => window.location.reload()} /></main></div></div>;

  return <div className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="app-frame">
    {screen !== 'home' && <TopBar onBack={leaveSession} initial={nameInitial(myName)} />}
    <main className="main-content">
      {error && screen !== 'join' && <InlineError message={error} />}
      {waitingNotice && screen === 'wait' && <InlineError message={waitingNotice} />}
      {screen === 'home' && <HomeScreen name={displayName} setName={setDisplayName} nameError={nameError} onCreate={startCreate} onJoin={() => { setNameError(''); setError(''); setScreen('join'); }} disabled={!authReady || busy} />}
      {screen === 'join' && <JoinScreen name={displayName} setName={setDisplayName} nameError={nameError} code={joinCode} setCode={setJoinCode} error={error} onJoin={startJoin} onBack={() => { setError(''); setNameError(''); setScreen('home'); }} disabled={!authReady || busy} />}
      {screen === 'waiting' && session && <WaitingScreen code={session.joinCode} inviteUrl={inviteUrl} name={myName || 'You'} partnerName={partnerName} partnerJoined={session.partnerJoined} onStart={beginRating} disabled={busy} onCopyCode={() => void copyCode()} onCopyInviteLink={() => void copyInviteLink()} notice={shareNotice} />}
      {screen === 'rating' && <RatingScreen round={roundNumber} position={position} food={currentFood} onChoose={chooseReaction} disabled={busy} />}
      {screen === 'wait' && <WaitingForPartner name={myName || 'there'} />}
      {screen === 'reveal' && <RevealScreen matches={matches} proposal={proposal} partnerName={partnerName} onPropose={proposeFood} onAccept={() => void acceptProposal()} onReject={() => void rejectProposal()} disabled={busy} onAnotherRound={startAnotherRound} />}
      {screen === 'chosen' && chosenFood && <ChosenScreen food={chosenFood} round={roundNumber} decidedBy={decidedBy} onAnotherRound={startAnotherRound} disabled={busy} />}
    </main>
    {screen !== 'rating' && screen !== 'home' && <FooterHint />}
  </div></div>;
}

function TopBar({ onBack, initial }: { onBack: () => void; initial: string }) { return <header className="topbar"><button className="icon-button" onClick={onBack} aria-label="Go back"><ArrowLeft size={24} /></button><div className="brand-mark small"><Utensils size={18} /></div><span className="topbar-title">FoodMood</span><div className="avatar">{initial}</div></header>; }
function Brand() { return <div className="brand-lockup"><div className="brand-mark"><Utensils size={25} /></div><span>FoodMood</span></div>; }
function InlineError({ message }: { message: string }) { return <div className="inline-error" role="alert">{message}</div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="center-screen error-state"><div className="waiting-orbit"><X size={35} /></div><div className="eyebrow">FoodMood needs a moment</div><h1>Let’s try<br /><em>that again.</em></h1><p>{message}</p><button className="primary-button full" onClick={onRetry}>Try again <RotateCcw size={18} /></button></div>; }

function NameField({ id, value, setValue, label, placeholder, error }: { id: string; value: string; setValue: (value: string) => void; label: string; placeholder: string; error: string }) { return <div className="name-field"><label className="field-label" htmlFor={id}>{label}</label><div className="field-input-wrap"><Users size={19} /><input id={id} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} maxLength={MAX_DISPLAY_NAME_LENGTH} autoComplete="off" autoCapitalize="words" onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div>{error && <p className="error-message">{error}</p>}</div>; }

function HomeScreen({ name, setName, nameError, onCreate, onJoin, disabled }: { name: string; setName: (value: string) => void; nameError: string; onCreate: () => void; onJoin: () => void; disabled: boolean }) { return <div className="home-screen"><div className="home-header"><Brand /><span className="sync-pill"><span /> {disabled ? 'Connecting' : 'Sync ready'}</span></div><div className="hero-visual" aria-label="A warm shared meal"><span className="visual-badge"><Heart size={17} fill="currentColor" /> 100% match energy</span><span className="visual-food visual-food-one">🍕</span><span className="visual-food visual-food-two">🌮</span><span className="visual-caption">Zero drama <ArrowRight size={15} /></span></div><div className="hero-copy"><div className="hero-kicker"><Sparkles size={15} /> Two appetites. One answer.</div><h1>Find what you’re<br /><em>both in the mood</em> for.</h1><p>Swipe your honest cravings in private. Reveal only what you both want to eat tonight.</p></div><NameField id="create-name" value={name} setValue={setName} label="Your name" placeholder="e.g. Abhishek" error={nameError} /><div className="home-actions"><button className="primary-button" onClick={onCreate} disabled={disabled}>Start a FoodMood <ArrowRight size={22} /></button><button className="secondary-button" onClick={onJoin} disabled={disabled}><span className="join-symbol">#</span> Join a FoodMood</button></div><div className="home-footer home-trust"><span>Two people</span><i /> <span>Private ratings</span><i /> <strong>Instant match</strong></div></div>; }

function JoinScreen({ name, setName, nameError, code, setCode, error, onJoin, onBack, disabled }: { name: string; setName: (value: string) => void; nameError: string; code: string; setCode: (value: string) => void; error: string; onJoin: () => void; onBack: () => void; disabled: boolean }) { return <div className="form-screen"><div className="eyebrow"><Users size={16} /> Join a FoodMood</div><h1>Bring your<br /><em>appetite.</em></h1><p className="screen-intro">Enter the secret code your person sent you. You’ll both rate the same 12 foods.</p><NameField id="join-name" value={name} setValue={setName} label="Your name" placeholder="e.g. Abhishek" error={nameError} /><label className="field-label" htmlFor="join-code">Session join code</label><div className="code-input-wrap"><Clipboard size={19} /><input id="join-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="MOOD-48" maxLength={12} /></div>{error && <p className="error-message">{error}</p>}<button className="primary-button full" onClick={onJoin} disabled={disabled || !code.trim()}>Join FoodMood <ArrowRight size={19} /></button><button className="text-button" onClick={onBack}>I’d rather create one</button><div className="info-card"><LockKeyhole size={20} /><div><strong>Private by design</strong><span>Your choices stay hidden from your partner until you both finish.</span></div></div></div>; }

function WaitingScreen({ code, inviteUrl, name, partnerName, partnerJoined, onStart, disabled, onCopyCode, onCopyInviteLink, notice }: { code: string; inviteUrl: string; name: string; partnerName: string; partnerJoined: boolean; onStart: () => void; disabled: boolean; onCopyCode: () => void; onCopyInviteLink: () => void; notice: string }) { return <div className="waiting-screen"><div className="eyebrow"><span className="live-dot" /> Lobby active · two-to-tango</div><section className="lobby-card"><div className="round-pill"><Flame size={16} /> Table for two</div><h1>Grab your partner<br />in dine</h1><p>Share this secret code to pair appetites and banish “I don’t know, whatever you want” forever.</p><span className="code-label">Session join code</span><div className="session-code"><span>{code}</span><button className="copy-button" aria-label="Copy session code" onClick={onCopyCode}><Copy size={20} /></button></div><div className="invite-link"><span className="code-label invite-label">Or send this invite link</span><div className="invite-link-row"><span className="invite-url">{inviteUrl}</span><button type="button" className="copy-link-button" onClick={onCopyInviteLink}><Copy size={16} /> Copy invite link</button></div></div>{notice && <p className="copy-feedback" role="status">{notice}</p>}</section><section className="status-card"><div className="section-heading"><h2>Dining duo status</h2><span className="seat-pill"><span /> {partnerJoined ? '2 of 2' : '1 of 2'} seated</span></div><div className="person-row"><div className="person-avatar coral-bg">{nameInitial(name)}</div><div className="person-info"><strong>You ({name})</strong><span className="ready-text"><CheckCircle2 size={15} /> Ready to choose</span></div><span className="ready-pill">READY</span></div><div className="person-row waiting-row"><div className="person-avatar waiting-avatar"><Users size={22} /></div><div className="person-info"><strong>{partnerJoined ? `${partnerName} is here` : `Waiting for ${partnerName}…`}</strong><span>{partnerJoined ? 'Your table is ready.' : 'Share this code so they can join.'}</span></div></div><button className="primary-button full start-button" onClick={onStart} disabled={!partnerJoined || disabled}><Utensils size={19} /> {partnerJoined ? 'Start rating' : 'Waiting for partner'}</button></section><div className="deck-preview"><div><span>Tonight’s deck preview</span><strong>12 options loaded</strong></div><div className="preview-chips">{foods.slice(0, 4).map((food) => <span key={food.id}>{food.emoji} {food.name}</span>)}</div></div></div>; }

function RatingScreen({ round, position, food, onChoose, disabled }: { round: number; position: number; food: FoodOption; onChoose: (reaction: Reaction) => void; disabled: boolean }) { const progress = ((position + 1) / foods.length) * 100; return <div className="rating-screen"><div className="rating-top"><div><Brand /></div><span className="round-count">Round {round} · <strong>{position + 1}</strong> / 12</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="privacy-banner"><LockKeyhole size={16} /> Your choices are 100% private until both finish</div><div className={`food-card ${food.color}`}><div className="food-image" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.3)), url(${foodImages[food.id]})` } : undefined}><span className="food-large-emoji">{food.emoji}</span><span className="food-sticker">Tonight’s option</span></div><div className="food-card-content"><h1>{food.name}</h1><p>{food.description}</p></div></div><p className="swipe-copy">How does this one feel?</p><div className="reaction-grid"><button className="reaction-button no" onClick={() => onChoose('not_today')} disabled={disabled}><span className="reaction-icon"><X size={28} strokeWidth={3} /></span><strong>Not today</strong></button><button className="reaction-button maybe" onClick={() => onChoose('maybe')} disabled={disabled}><span className="reaction-icon">🤔</span><strong>Maybe</strong></button><button className="reaction-button yes" onClick={() => onChoose('craving')} disabled={disabled}><span className="reaction-icon"><Heart size={29} /></span><strong>Craving it!</strong></button></div></div>; }

function WaitingForPartner({ name }: { name: string }) { return <div className="center-screen"><div className="waiting-orbit"><LockKeyhole size={35} /></div><div className="eyebrow"><span className="live-dot" /> Choices locked in</div><h1>Nice picks,<br /><em>{name}.</em></h1><p>You’re all done. We’ll reveal what you both want as soon as your partner finishes.</p><div className="mini-progress">{foods.map((food) => <span key={food.id} className="done-dot" />)}</div><div className="privacy-card"><LockKeyhole size={20} /><span>Your choices are hidden. No peeking, promise.</span></div></div>; }

function ProposalCard({ view, partnerName, food, onAccept, onReject, disabled }: { view: ProposalView; partnerName: string; food: FoodOption; onAccept: () => void; onReject: () => void; disabled: boolean }) {
  // The sender waits; only the other participant gets the decision.
  if (view.mode === 'mine') {
    return <section className="proposal-card proposal-mine">
      <span className="proposal-pill">Your proposal</span>
      <div className="proposal-food"><span className="proposal-emoji">{food.emoji}</span><div><strong>{food.name}</strong><small>{food.description}</small></div></div>
      <p className="proposal-waiting"><span className="proposal-spinner" /> Waiting for {partnerName} to decide…</p>
    </section>;
  }

  return <section className="proposal-card proposal-theirs">
    <span className="proposal-pill proposal-pill-theirs">{partnerName}&apos;s pick</span>
    <div className="proposal-food"><span className="proposal-emoji">{food.emoji}</span><div><strong>{food.name}</strong><small>{food.description}</small></div></div>
    <p className="proposal-question">{partnerName} wants {food.name} tonight. Are you in?</p>
    <div className="proposal-actions">
      <button className="primary-button" onClick={onAccept} disabled={disabled}><Check size={18} /> Accept</button>
      <button className="secondary-button" onClick={onReject} disabled={disabled}><RotateCcw size={18} /> Reject &amp; start another round</button>
    </div>
  </section>;
}

function RevealScreen({ matches, proposal, partnerName, onPropose, onAccept, onReject, disabled, onAnotherRound }: { matches: Match[]; proposal: ProposalView; partnerName: string; onPropose: (food: FoodOption) => void; onAccept: () => void; onReject: () => void; disabled: boolean; onAnotherRound: () => void }) { const groups = groupMatchesByTier(matches); const proposedFood = proposal.mode === 'none' ? null : resolveFoodOption(proposal.foodOptionId); return <div className="reveal-screen"><div className="reveal-header"><div className="eyebrow"><Sparkles size={16} /> The reveal</div><span className="match-count">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span></div><h1>Look at you two.<br /><em>On the same page.</em></h1><p className="screen-intro">Here’s what survived both appetites. No scores, no blame — just good options.</p>{proposedFood ? <ProposalCard view={proposal} partnerName={partnerName} food={proposedFood} onAccept={onAccept} onReject={onReject} disabled={disabled} /> : matches.length ? <div className="matches-list">{groups.map(({ tier, matches: tierMatches }) => { return <div className="match-group" key={tier}><div className="tier-heading"><span className={`tier-dot ${tier === 'Perfect match' ? 'perfect' : tier === 'Possible match' ? 'possible' : 'backup'}`} />{tier}<span>{tierMatches.length}</span></div>{tierMatches.map((match) => <button className={`match-card ${tier === 'Perfect match' ? 'match-perfect' : tier === 'Possible match' ? 'match-possible' : 'match-backup'}`} key={match.id} onClick={() => onPropose(match)} disabled={disabled}>{foodImages[match.id] ? <span className="match-photo" style={{ backgroundImage: `url(${foodImages[match.id]})` }} /> : <span className="match-emoji">{match.emoji}</span>}<span><strong>{match.emoji} {match.name}</strong><small>{match.description}</small></span><ChevronRight size={20} /></button>)}</div>})}</div> : <div className="empty-match"><div className="empty-icon">🍽️</div><h2>No shared cravings this round</h2><p>That happens. Fresh round, fresh chance to find your FoodMood.</p></div>}<div className="reveal-actions">{matches.length > 0 && !proposedFood ? <p><Heart size={15} fill="currentColor" /> Propose a match for {partnerName} to confirm</p> : !proposedFood ? <button className="secondary-button full" onClick={onAnotherRound} disabled={disabled}><RotateCcw size={18} /> Start another round</button> : null}</div></div>; }

function ChosenScreen({ food, round, decidedBy, onAnotherRound, disabled }: { food: FoodOption; round: number; decidedBy: string; onAnotherRound: () => void; disabled: boolean }) { return <div className="chosen-screen"><div className="success-burst"><Check size={38} strokeWidth={3} /></div><div className="eyebrow"><Sparkles size={16} /> Tonight’s FoodMood</div><h1>{food.name}<em>!</em></h1><p className="chosen-subtitle">You’re both craving it.</p><div className="chosen-hero" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.35)), url(${foodImages[food.id]})` } : undefined}><span className="chosen-match-badge"><Flame size={15} /> Perfect match</span><span className="chosen-emoji">{food.emoji}</span><span className="chosen-hero-label"><Heart size={17} /> Unanimous craving</span></div><div className="decision-summary"><div><span className="summary-icon"><Sparkles size={17} /></span><div><small>Decision summary</small><strong>Indecision defeated</strong></div></div><span className="saved-pill"><CheckCircle2 size={15} /> Both agreed</span><div className="summary-stats"><span><small>Decided by</small><strong>{decidedBy}</strong></span><span><small>Round</small><strong>{round} complete</strong></span></div></div><button className="primary-button full" onClick={onAnotherRound} disabled={disabled}><RotateCcw size={18} /> Start another round</button><button className="text-button">Done with dinner decisions</button></div>; }
function FooterHint() { return <footer className="footer-hint"><Clock3 size={15} /> A tiny decision now, a much better dinner later.</footer>; }

export default App;
