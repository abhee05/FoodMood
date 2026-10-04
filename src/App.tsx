import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clipboard, Clock3, Copy,
  Flame, Heart, LockKeyhole, MessageCircle, RotateCcw, Share2, Sparkles, Users, Utensils, X,
} from 'lucide-react';
import {
  authenticateAnonymously, createFoodMoodSession, getFoodMoodMatches, getFoodMoodSessionState,
  joinFoodMoodSession, normalizeState, selectFinalFoodMood, startAnotherFoodMoodRound,
  submitFoodMoodReactions, type FoodMoodMatch, type FoodMoodState, type Reaction,
} from '@/lib/foodmood-api';

type Screen = 'home' | 'join' | 'waiting' | 'rating' | 'wait' | 'reveal' | 'chosen';
type FoodOption = { id: string; name: string; emoji: string; description: string; color: string };

type Match = FoodOption & { tier: FoodMoodMatch['tier'] };

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

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? '');
  const [session, setSession] = useState<FoodMoodState | null>(null);
  const [position, setPosition] = useState(0);
  const [myReactions, setMyReactions] = useState<Record<string, Reaction>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodOption | null>(null);

  const currentFood = foods[position];
  const partnerName = session?.participantSeat === 2 ? 'Alex' : 'Sam';
  const roundNumber = session?.roundNumber ?? 1;

  useEffect(() => {
    let active = true;
    authenticateAnonymously().then(() => {
      if (active) setAuthReady(true);
    }).catch((authFailure: unknown) => {
      if (active) setAuthError(authFailure instanceof Error ? authFailure.message : 'We could not start FoodMood. Please try again.');
    });
    return () => { active = false; };
  }, []);

  const refreshSession = useCallback(async (): Promise<FoodMoodState> => {
    const nextSession = normalizeState(await getFoodMoodSessionState());
    setSession(nextSession);
    if (nextSession.finalFoodOptionId) {
      const finalFood = foods.find((food) => food.id === nextSession.finalFoodOptionId) ?? null;
      setSelectedFood(finalFood);
    }
    return nextSession;
  }, []);

  const revealMatches = useCallback(async (): Promise<void> => {
    const backendMatches = await getFoodMoodMatches();
    const nextMatches = backendMatches.map((match) => {
      const food = foods.find((option) => option.id === match.foodOptionId);
      return food ? { ...food, tier: match.tier } : null;
    }).filter((match): match is Match => match !== null);
    setMatches(nextMatches);
  }, []);

  useEffect(() => {
    if (!session || (screen !== 'waiting' && screen !== 'wait' && screen !== 'reveal' && screen !== 'chosen')) return;
    let active = true;
    const poll = async () => {
      try {
        const nextSession = await refreshSession();
        if (!active) return;
        if (nextSession.finalFoodOptionId) {
          setScreen('chosen');
        } else if (nextSession.bothFinished && screen === 'wait') {
          await revealMatches();
          if (active) setScreen('reveal');
        }
      } catch {
        if (active && screen === 'wait') setError('Still waiting for the other participant. We will keep checking.');
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, [refreshSession, revealMatches, screen, session?.sessionId]);

  const startCreate = async () => {
    if (!authReady) return;
    setBusy(true); setError('');
    try {
      const created = await createFoodMoodSession();
      setSession(created); setPosition(0); setMyReactions({}); setMatches([]); setSelectedFood(null); setScreen('waiting');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not create a FoodMood. Please try again.');
    } finally { setBusy(false); }
  };

  const startJoin = async () => {
    if (!authReady || !joinCode.trim()) return;
    setBusy(true); setError('');
    try {
      const joined = await joinFoodMoodSession(joinCode);
      setSession(joined); setPosition(0); setMyReactions({}); setMatches([]); setSelectedFood(null); setScreen('waiting');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not join this FoodMood. Please try again.');
    } finally { setBusy(false); }
  };

  const beginRating = () => {
    setError(''); setPosition(0); setMyReactions({}); setScreen('rating');
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

  const selectFood = async (food: FoodOption) => {
    setBusy(true); setError('');
    try {
      await selectFinalFoodMood(food.id);
      setSelectedFood(food);
      const nextSession = await refreshSession();
      if (nextSession.finalFoodOptionId) setScreen('chosen');
    } catch (failure: unknown) {
      try {
        const nextSession = await refreshSession();
        if (nextSession.finalFoodOptionId) setScreen('chosen');
        else throw failure;
      } catch (refreshFailure: unknown) {
        setError(refreshFailure instanceof Error ? refreshFailure.message : 'Your partner may have already chosen the final FoodMood.');
      }
    } finally { setBusy(false); }
  };

  const startAnotherRound = async () => {
    if (!session) return;
    const previousRound = session.roundNumber;
    setBusy(true); setError('');
    try {
      const nextRound = await startAnotherFoodMoodRound();
      setSession(nextRound); setPosition(0); setMyReactions({}); setMatches([]); setSelectedFood(null); setScreen('rating');
    } catch (failure: unknown) {
      try {
        const refreshed = await refreshSession();
        if (refreshed.roundNumber > previousRound) {
          setPosition(0); setMyReactions({}); setMatches([]); setSelectedFood(null); setScreen('rating');
        } else throw failure;
      } catch (refreshFailure: unknown) {
        setError(refreshFailure instanceof Error ? refreshFailure.message : 'We could not start another round yet. Please try again.');
      }
    } finally { setBusy(false); }
  };

  if (authError) return <div className="app-shell"><div className="app-frame"><main className="main-content"><ErrorState message={authError} onRetry={() => window.location.reload()} /></main></div></div>;

  return <div className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="app-frame">
    {screen !== 'home' && <TopBar onBack={() => setScreen('home')} />}
    <main className="main-content">
      {error && screen !== 'rating' && <InlineError message={error} />}
      {screen === 'home' && <HomeScreen onCreate={startCreate} onJoin={() => setScreen('join')} disabled={!authReady || busy} />}
      {screen === 'join' && <JoinScreen code={joinCode} setCode={setJoinCode} error={error} onJoin={startJoin} onBack={() => { setError(''); setScreen('home'); }} disabled={!authReady || busy} />}
      {screen === 'waiting' && session && <WaitingScreen code={session.joinCode} name={session.participantName || (session.participantSeat === 1 ? 'Alex' : 'Sam')} partnerName={partnerName} partnerJoined={session.partnerJoined} onStart={beginRating} disabled={busy} onCopy={() => void copyJoinLink(session.joinCode)} />}
      {screen === 'rating' && <RatingScreen round={roundNumber} position={position} food={currentFood} onChoose={chooseReaction} disabled={busy} />}
      {screen === 'wait' && <WaitingForPartner name={session?.participantName || 'there'} />}
      {screen === 'reveal' && <RevealScreen matches={matches} onSelect={selectFood} disabled={busy} onAnotherRound={startAnotherRound} />}
      {screen === 'chosen' && selectedFood && <ChosenScreen food={selectedFood} round={roundNumber} onAnotherRound={startAnotherRound} disabled={busy} />}
    </main>
    {screen !== 'rating' && screen !== 'home' && <FooterHint />}
  </div></div>;
}

async function copyJoinLink(code: string): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}`;
  if (navigator.share) { await navigator.share({ title: 'Join my FoodMood', url }); return; }
  await navigator.clipboard.writeText(url);
}

function TopBar({ onBack }: { onBack: () => void }) { return <header className="topbar"><button className="icon-button" onClick={onBack} aria-label="Go back"><ArrowLeft size={24} /></button><div className="brand-mark small"><Utensils size={18} /></div><span className="topbar-title">FoodMood</span><div className="avatar">A</div></header>; }
function Brand() { return <div className="brand-lockup"><div className="brand-mark"><Utensils size={25} /></div><span>FoodMood</span></div>; }
function InlineError({ message }: { message: string }) { return <div className="inline-error" role="alert">{message}</div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="center-screen error-state"><div className="waiting-orbit"><X size={35} /></div><div className="eyebrow">FoodMood needs a moment</div><h1>Let’s try<br /><em>that again.</em></h1><p>{message}</p><button className="primary-button full" onClick={onRetry}>Try again <RotateCcw size={18} /></button></div>; }

function HomeScreen({ onCreate, onJoin, disabled }: { onCreate: () => void; onJoin: () => void; disabled: boolean }) { return <div className="home-screen"><div className="home-header"><Brand /><span className="sync-pill"><span /> {disabled ? 'Connecting' : 'Sync ready'}</span></div><div className="hero-visual" aria-label="A warm shared meal"><span className="visual-badge"><Heart size={17} fill="currentColor" /> 100% match energy</span><span className="visual-food visual-food-one">🍕</span><span className="visual-food visual-food-two">🌮</span><span className="visual-caption">Zero drama <ArrowRight size={15} /></span></div><div className="hero-copy"><div className="hero-kicker"><Sparkles size={15} /> Two appetites. One answer.</div><h1>Find what you’re<br /><em>both in the mood</em> for.</h1><p>Swipe your honest cravings in private. Reveal only what you both want to eat tonight.</p></div><div className="home-actions"><button className="primary-button" onClick={onCreate} disabled={disabled}>Start a FoodMood <ArrowRight size={22} /></button><button className="secondary-button" onClick={onJoin} disabled={disabled}><span className="join-symbol">#</span> Join a FoodMood</button></div><div className="home-footer home-trust"><span>Two people</span><i /> <span>Private ratings</span><i /> <strong>Instant match</strong></div></div>; }

function JoinScreen({ code, setCode, error, onJoin, onBack, disabled }: { code: string; setCode: (value: string) => void; error: string; onJoin: () => void; onBack: () => void; disabled: boolean }) { return <div className="form-screen"><div className="eyebrow"><Users size={16} /> Join a FoodMood</div><h1>Bring your<br /><em>appetite.</em></h1><p className="screen-intro">Enter the secret code your person sent you. You’ll both rate the same 12 foods.</p><label className="field-label" htmlFor="join-code">Session join code</label><div className="code-input-wrap"><Clipboard size={19} /><input id="join-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="MOOD-48" maxLength={12} /></div>{error && <p className="error-message">{error}</p>}<button className="primary-button full" onClick={onJoin} disabled={disabled || !code.trim()}>Join FoodMood <ArrowRight size={19} /></button><button className="text-button" onClick={onBack}>I’d rather create one</button><div className="info-card"><LockKeyhole size={20} /><div><strong>Private by design</strong><span>Your choices stay hidden from your partner until you both finish.</span></div></div></div>; }

function WaitingScreen({ code, name, partnerName, partnerJoined, onStart, disabled, onCopy }: { code: string; name: string; partnerName: string; partnerJoined: boolean; onStart: () => void; disabled: boolean; onCopy: () => void }) { return <div className="waiting-screen"><div className="eyebrow"><span className="live-dot" /> Lobby active · two-to-tango</div><section className="lobby-card"><div className="round-pill"><Flame size={16} /> Table for two</div><h1>Grab your partner<br />in dine</h1><p>Share this secret code to pair appetites and banish “I don’t know, whatever you want” forever.</p><span className="code-label">Session join code</span><div className="session-code"><span>{code}</span><button className="copy-button" aria-label="Copy session link" onClick={onCopy}><Copy size={20} /></button></div><button className="primary-button full" onClick={onCopy}><Share2 size={19} /> Share invite link</button><div className="share-options"><span><MessageCircle size={16} /> Share link</span><span><Copy size={16} /> Copy code</span></div></section><section className="status-card"><div className="section-heading"><h2>Dining duo status</h2><span className="seat-pill"><span /> {partnerJoined ? '2 of 2' : '1 of 2'} seated</span></div><div className="person-row"><div className="person-avatar coral-bg">{name[0]}</div><div className="person-info"><strong>You ({name})</strong><span className="ready-text"><CheckCircle2 size={15} /> Ready to choose</span></div><span className="ready-pill">READY</span></div><div className="person-row waiting-row"><div className="person-avatar waiting-avatar"><Users size={22} /></div><div className="person-info"><strong>{partnerJoined ? `${partnerName} is here` : `Waiting for ${partnerName}…`}</strong><span>{partnerJoined ? 'Your table is ready.' : 'Share this code so they can join.'}</span></div></div><button className="primary-button full start-button" onClick={onStart} disabled={!partnerJoined || disabled}><Utensils size={19} /> {partnerJoined ? 'Start rating' : 'Waiting for partner'}</button></section><div className="deck-preview"><div><span>Tonight’s deck preview</span><strong>12 options loaded</strong></div><div className="preview-chips">{foods.slice(0, 4).map((food) => <span key={food.id}>{food.emoji} {food.name}</span>)}</div></div></div>; }

function RatingScreen({ round, position, food, onChoose, disabled }: { round: number; position: number; food: FoodOption; onChoose: (reaction: Reaction) => void; disabled: boolean }) { const progress = ((position + 1) / foods.length) * 100; return <div className="rating-screen"><div className="rating-top"><div><Brand /></div><span className="round-count">Round {round} · <strong>{position + 1}</strong> / 12</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="privacy-banner"><LockKeyhole size={16} /> Your choices are 100% private until both finish</div><div className={`food-card ${food.color}`}><div className="food-image" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.3)), url(${foodImages[food.id]})` } : undefined}><span className="food-large-emoji">{food.emoji}</span><span className="food-sticker">Tonight’s option</span></div><div className="food-card-content"><h1>{food.name}</h1><p>{food.description}</p></div></div><p className="swipe-copy">How does this one feel?</p><div className="reaction-grid"><button className="reaction-button no" onClick={() => onChoose('not_today')} disabled={disabled}><span className="reaction-icon"><X size={28} strokeWidth={3} /></span><strong>Not today</strong></button><button className="reaction-button maybe" onClick={() => onChoose('maybe')} disabled={disabled}><span className="reaction-icon">🤔</span><strong>Maybe</strong></button><button className="reaction-button yes" onClick={() => onChoose('craving')} disabled={disabled}><span className="reaction-icon"><Heart size={29} /></span><strong>Craving it!</strong></button></div></div>; }

function WaitingForPartner({ name }: { name: string }) { return <div className="center-screen"><div className="waiting-orbit"><LockKeyhole size={35} /></div><div className="eyebrow"><span className="live-dot" /> Choices locked in</div><h1>Nice picks,<br /><em>{name}.</em></h1><p>You’re all done. We’ll reveal what you both want as soon as your partner finishes.</p><div className="mini-progress">{foods.map((food) => <span key={food.id} className="done-dot" />)}</div><div className="privacy-card"><LockKeyhole size={20} /><span>Your choices are hidden. No peeking, promise.</span></div></div>; }

function RevealScreen({ matches, onSelect, disabled, onAnotherRound }: { matches: Match[]; onSelect: (food: FoodOption) => void; disabled: boolean; onAnotherRound: () => void }) { const grouped = ['Perfect match', 'Possible match', 'Backup match'] as const; return <div className="reveal-screen"><div className="reveal-header"><div className="eyebrow"><Sparkles size={16} /> The reveal</div><span className="match-count">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span></div><h1>Look at you two.<br /><em>On the same page.</em></h1><p className="screen-intro">Here’s what survived both appetites. No scores, no blame — just good options.</p>{matches.length ? <div className="matches-list">{grouped.map((tier) => { const tierMatches = matches.filter((match) => match.tier === tier); if (!tierMatches.length) return null; return <div className="match-group" key={tier}><div className="tier-heading"><span className={`tier-dot ${tier === 'Perfect match' ? 'perfect' : tier === 'Possible match' ? 'possible' : 'backup'}`} />{tier}<span>{tierMatches.length}</span></div>{tierMatches.map((match) => <button className={`match-card ${tier === 'Perfect match' ? 'match-perfect' : tier === 'Possible match' ? 'match-possible' : 'match-backup'}`} key={match.id} onClick={() => onSelect(match)} disabled={disabled}>{foodImages[match.id] ? <span className="match-photo" style={{ backgroundImage: `url(${foodImages[match.id]})` }} /> : <span className="match-emoji">{match.emoji}</span>}<span><strong>{match.emoji} {match.name}</strong><small>{match.description}</small></span><ChevronRight size={20} /></button>)}</div>})}</div> : <div className="empty-match"><div className="empty-icon">🍽️</div><h2>No shared cravings this round</h2><p>That happens. Fresh round, fresh chance to find your FoodMood.</p></div>}<div className="reveal-actions">{matches.length > 0 ? <p><Heart size={15} fill="currentColor" /> Choose a match to make it tonight’s FoodMood</p> : <button className="secondary-button full" onClick={onAnotherRound} disabled={disabled}><RotateCcw size={18} /> Start another round</button>}</div></div>; }

function ChosenScreen({ food, round, onAnotherRound, disabled }: { food: FoodOption; round: number; onAnotherRound: () => void; disabled: boolean }) { return <div className="chosen-screen"><div className="success-burst"><Check size={38} strokeWidth={3} /></div><div className="eyebrow"><Sparkles size={16} /> Tonight’s FoodMood</div><h1>{food.name}<em>!</em></h1><p className="chosen-subtitle">You’re both craving it.</p><div className="chosen-hero" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.35)), url(${foodImages[food.id]})` } : undefined}><span className="chosen-match-badge"><Flame size={15} /> Perfect match</span><span className="chosen-emoji">{food.emoji}</span><span className="chosen-hero-label"><Heart size={17} /> Unanimous craving</span></div><div className="decision-summary"><div><span className="summary-icon"><Sparkles size={17} /></span><div><small>Decision summary</small><strong>Indecision defeated</strong></div></div><span className="saved-pill"><CheckCircle2 size={15} /> Both agreed</span><div className="summary-stats"><span><small>Decided by</small><strong>Two people</strong></span><span><small>Round</small><strong>{round} complete</strong></span></div></div><button className="primary-button full" onClick={onAnotherRound} disabled={disabled}><RotateCcw size={18} /> Start another round</button><button className="text-button">Done with dinner decisions</button></div>; }
function FooterHint() { return <footer className="footer-hint"><Clock3 size={15} /> A tiny decision now, a much better dinner later.</footer>; }

export default App;
