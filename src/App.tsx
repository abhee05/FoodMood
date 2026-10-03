import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  Flame,
  Heart,
  LockKeyhole,
  MessageCircle,
  RotateCcw,
  Share2,
  Sparkles,
  Users,
  Utensils,
  X,
} from 'lucide-react';

type Reaction = 'craving' | 'maybe' | 'not_today';
type Screen = 'home' | 'join' | 'waiting' | 'rating' | 'wait' | 'reveal' | 'chosen';
type FoodOption = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
};
type MatchTier = 'Perfect match' | 'Possible match' | 'Backup match';
type Match = FoodOption & { tier: MatchTier };

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

function getMatches(a: Record<string, Reaction>, b: Record<string, Reaction>): Match[] {
  const results: Match[] = [];
  foods.forEach((food) => {
    const first = a[food.id];
    const second = b[food.id];
    if (first === 'not_today' || second === 'not_today') return;
    if (first === 'craving' && second === 'craving') results.push({ ...food, tier: 'Perfect match' });
    if ((first === 'craving' && second === 'maybe') || (first === 'maybe' && second === 'craving')) results.push({ ...food, tier: 'Possible match' });
    if (first === 'maybe' && second === 'maybe') results.push({ ...food, tier: 'Backup match' });
  });
  const order: Record<MatchTier, number> = { 'Perfect match': 0, 'Possible match': 1, 'Backup match': 2 };
  return results.sort((first, second) => order[first.tier] - order[second.tier] || foods.indexOf(first) - foods.indexOf(second));
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [name, setName] = useState('Alex');
  const [joinCode, setJoinCode] = useState('MOOD-48');
  const [sessionCode, setSessionCode] = useState('MOOD-48');
  const [partnerName, setPartnerName] = useState('Sam');
  const [partnerJoined, setPartnerJoined] = useState(false);
  const [round, setRound] = useState(1);
  const [position, setPosition] = useState(0);
  const [myReactions, setMyReactions] = useState<Record<string, Reaction>>({});
  const [partnerReactions, setPartnerReactions] = useState<Record<string, Reaction>>({});
  const [finalChoice, setFinalChoice] = useState<FoodOption | null>(null);
  const [joinError, setJoinError] = useState('');

  const currentFood = foods[position];
  const matches = useMemo(() => getMatches(myReactions, partnerReactions), [myReactions, partnerReactions]);

  const startCreate = () => {
    const generatedCode = `MOOD-${Math.floor(10 + Math.random() * 89)}`;
    setSessionCode(generatedCode);
    setName('Alex');
    setRound(1);
    setFinalChoice(null);
    setPartnerJoined(false);
    setScreen('waiting');
  };

  const startJoin = () => {
    setJoinError('');
    if (joinCode.trim().toUpperCase() !== sessionCode) {
      setJoinError('That code is not active in this prototype. Try MOOD-48 or create a new FoodMood.');
      return;
    }
    setName('Sam');
    setPartnerName('Alex');
    setPartnerJoined(true);
    setScreen('waiting');
  };

  const beginRating = () => {
    setPosition(0);
    setMyReactions({});
    setPartnerReactions({});
    setScreen('rating');
  };

  const chooseReaction = (reaction: Reaction) => {
    const next = { ...myReactions, [currentFood.id]: reaction };
    setMyReactions(next);
    if (position === foods.length - 1) {
      setScreen('wait');
    } else {
      setPosition((current) => current + 1);
    }
  };

  const simulateJoin = () => {
    setPartnerJoined(true);
  };

  const simulatePartner = () => {
    const simulated: Record<string, Reaction> = {};
    foods.forEach((food, index) => {
      simulated[food.id] = index < 3 ? 'craving' : index < 6 ? 'maybe' : 'not_today';
    });
    setPartnerReactions(simulated);
    setScreen('reveal');
  };

  const startAnotherRound = () => {
    setRound((current) => current + 1);
    setFinalChoice(null);
    setPosition(0);
    setMyReactions({});
    setPartnerReactions({});
    setScreen('rating');
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="app-frame">
        {screen !== 'home' && <TopBar onBack={() => setScreen('home')} />}
        <main className="main-content">
          {screen === 'home' && <HomeScreen onCreate={startCreate} onJoin={() => setScreen('join')} />}
          {screen === 'join' && <JoinScreen code={joinCode} setCode={setJoinCode} error={joinError} onJoin={startJoin} onBack={() => setScreen('home')} />}
          {screen === 'waiting' && <WaitingScreen code={sessionCode} name={name} partnerName={partnerName} partnerJoined={partnerJoined} onStart={beginRating} onSimulateJoin={simulateJoin} />}
          {screen === 'rating' && <RatingScreen round={round} position={position} food={currentFood} onChoose={chooseReaction} />}
          {screen === 'wait' && <WaitingForPartner name={name} onSimulate={simulatePartner} />}
          {screen === 'reveal' && <RevealScreen matches={matches} onSelect={(food) => { setFinalChoice(food); setScreen('chosen'); }} onAnotherRound={startAnotherRound} />}
          {screen === 'chosen' && finalChoice && <ChosenScreen food={finalChoice} round={round} onAnotherRound={startAnotherRound} />}
        </main>
        {screen !== 'rating' && screen !== 'home' && <FooterHint />}
      </div>
    </div>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-button" onClick={onBack} aria-label="Go back"><ArrowLeft size={24} /></button>
      <div className="brand-mark small"><Utensils size={18} /></div>
      <span className="topbar-title">FoodMood</span>
      <div className="avatar">A</div>
    </header>
  );
}

function Brand() {
  return <div className="brand-lockup"><div className="brand-mark"><Utensils size={25} /></div><span>FoodMood</span></div>;
}

function HomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return <div className="home-screen">
    <div className="home-header"><Brand /><span className="sync-pill"><span /> Sync ready</span></div>
    <div className="hero-visual" aria-label="A warm shared meal"><span className="visual-badge"><Heart size={17} fill="currentColor" /> 100% match energy</span><span className="visual-food visual-food-one">🍕</span><span className="visual-food visual-food-two">🌮</span><span className="visual-caption">Zero drama <ArrowRight size={15} /></span></div>
    <div className="hero-copy">
      <div className="hero-kicker"><Sparkles size={15} /> Two appetites. One answer.</div>
      <h1>Find what you’re<br /><em>both in the mood</em> for.</h1>
      <p>Swipe your honest cravings in private. Reveal only what you both want to eat tonight.</p>
    </div>
    <div className="home-actions">
      <button className="primary-button" onClick={onCreate}>Start a FoodMood <ArrowRight size={22} /></button>
      <button className="secondary-button" onClick={onJoin}><span className="join-symbol">#</span> Join a FoodMood</button>
    </div>
    <div className="home-footer home-trust"><span>Two people</span><i /> <span>Private ratings</span><i /> <strong>Instant match</strong></div>
  </div>;
}

function JoinScreen({ code, setCode, error, onJoin, onBack }: { code: string; setCode: (value: string) => void; error: string; onJoin: () => void; onBack: () => void }) {
  return <div className="form-screen">
    <div className="eyebrow"><Users size={16} /> Join a FoodMood</div>
    <h1>Bring your<br /><em>appetite.</em></h1>
    <p className="screen-intro">Enter the secret code your person sent you. You’ll both rate the same 12 foods.</p>
    <label className="field-label" htmlFor="join-code">Session join code</label>
    <div className="code-input-wrap"><Clipboard size={19} /><input id="join-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="MOOD-48" maxLength={7} /></div>
    {error && <p className="error-message">{error}</p>}
    <button className="primary-button full" onClick={onJoin}>Join FoodMood <ArrowRight size={19} /></button>
    <button className="text-button" onClick={onBack}>I’d rather create one</button>
    <div className="info-card"><LockKeyhole size={20} /><div><strong>Private by design</strong><span>Your choices stay hidden from your partner until you both finish.</span></div></div>
  </div>;
}

function WaitingScreen({ code, name, partnerName, partnerJoined, onStart, onSimulateJoin }: { code: string; name: string; partnerName: string; partnerJoined: boolean; onStart: () => void; onSimulateJoin: () => void }) {
  return <div className="waiting-screen">
    <div className="eyebrow"><span className="live-dot" /> Lobby active · two-to-tango</div>
    <section className="lobby-card">
      <div className="round-pill"><Flame size={16} /> Table for two</div>
      <h1>Grab your partner<br />in dine</h1>
      <p>Share this secret code to pair appetites and banish “I don’t know, whatever you want” forever.</p>
      <span className="code-label">Session join code</span>
      <div className="session-code"><span>{code}</span><button className="copy-button" aria-label="Copy session code"><Copy size={20} /></button></div>
      <button className="primary-button full"><Share2 size={19} /> Share invite link</button>
      <div className="share-options"><span><MessageCircle size={16} /> Messages</span><span><Share2 size={16} /> More</span></div>
    </section>
    <section className="status-card">
      <div className="section-heading"><h2>Dining duo status</h2><span className="seat-pill"><span /> {partnerJoined ? '2 of 2' : '1 of 2'} seated</span></div>
      <div className="person-row"><div className="person-avatar coral-bg">{name === 'Sam' ? 'S' : 'A'}</div><div className="person-info"><strong>You ({name}) <small>Host</small></strong><span className="ready-text"><CheckCircle2 size={15} /> Ready to choose</span></div><span className="ready-pill">READY</span></div>
      <div className="person-row waiting-row"><div className="person-avatar waiting-avatar"><Users size={22} /></div><div className="person-info"><strong>{partnerJoined ? `${partnerName} is here` : `Waiting for ${partnerName}…`}</strong><span>{partnerJoined ? 'Your table is ready.' : 'Share this code so they can join.'}</span></div></div>
      {name === 'Alex' && !partnerJoined && <div className="dev-tools"><span>Development simulator</span><button onClick={onSimulateJoin}>Simulate Sam joins</button></div>}
      <button className="primary-button full start-button" onClick={onStart} disabled={!partnerJoined}><Utensils size={19} /> {partnerJoined ? 'Start rating' : 'Waiting for partner'}</button>
    </section>
    <div className="deck-preview"><div><span>Tonight’s deck preview</span><strong>12 fresh bites loaded</strong></div><div className="preview-chips">{foods.slice(0, 4).map((food) => <span key={food.id}>{food.emoji} {food.name}</span>)}</div></div>
  </div>;
}

function RatingScreen({ round, position, food, onChoose }: { round: number; position: number; food: FoodOption; onChoose: (reaction: Reaction) => void }) {
  const progress = ((position + 1) / foods.length) * 100;
  return <div className="rating-screen">
    <div className="rating-top"><div><Brand /></div><span className="round-count">Round {round} · <strong>{position + 1}</strong> / 12</span></div>
    <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
    <div className="privacy-banner"><LockKeyhole size={16} /> Your choices are 100% private until both finish</div>
    <div className={`food-card ${food.color}`}>
      <div className="food-image" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.3)), url(${foodImages[food.id]})` } : undefined}><span className="food-large-emoji">{food.emoji}</span><span className="food-sticker">Tonight’s option</span></div>
      <div className="food-card-content"><h1>{food.name}</h1><p>{food.description}</p></div>
    </div>
    <p className="swipe-copy">How does this one feel?</p>
    <div className="reaction-grid">
      <button className="reaction-button no" onClick={() => onChoose('not_today')}><span className="reaction-icon"><X size={28} strokeWidth={3} /></span><strong>Not today</strong></button>
      <button className="reaction-button maybe" onClick={() => onChoose('maybe')}><span className="reaction-icon">🤔</span><strong>Maybe</strong></button>
      <button className="reaction-button yes" onClick={() => onChoose('craving')}><span className="reaction-icon"><Heart size={29} /></span><strong>Craving it!</strong></button>
    </div>
  </div>;
}

function WaitingForPartner({ name, onSimulate }: { name: string; onSimulate: () => void }) {
  return <div className="center-screen"><div className="waiting-orbit"><LockKeyhole size={35} /></div><div className="eyebrow"><span className="live-dot" /> Choices locked in</div><h1>Nice picks,<br /><em>{name}.</em></h1><p>You’re all done. We’ll reveal what you both want as soon as your partner finishes.</p><div className="mini-progress">{foods.map((food) => <span key={food.id} className="done-dot" />)}</div><div className="privacy-card"><LockKeyhole size={20} /><span>Your choices are hidden. No peeking, promise.</span></div><div className="dev-tools standalone"><span>Development simulator</span><button onClick={onSimulate}>Simulate partner finished</button></div></div>;
}

function RevealScreen({ matches, onSelect, onAnotherRound }: { matches: Match[]; onSelect: (food: FoodOption) => void; onAnotherRound: () => void }) {
  const grouped = ['Perfect match', 'Possible match', 'Backup match'] as const;
  return <div className="reveal-screen"><div className="reveal-header"><div className="eyebrow"><Sparkles size={16} /> The reveal</div><span className="match-count">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span></div><h1>Look at you two.<br /><em>On the same page.</em></h1><p className="screen-intro">Here’s what survived both appetites. No scores, no blame — just good options.</p>{matches.length ? <div className="matches-list">{grouped.map((tier) => { const tierMatches = matches.filter((match) => match.tier === tier); if (!tierMatches.length) return null; return <div className="match-group" key={tier}><div className="tier-heading"><span className={`tier-dot ${tier === 'Perfect match' ? 'perfect' : tier === 'Possible match' ? 'possible' : 'backup'}`} />{tier}<span>{tierMatches.length}</span></div>{tierMatches.map((match) => <button className={`match-card ${tier === 'Perfect match' ? 'match-perfect' : tier === 'Possible match' ? 'match-possible' : 'match-backup'}`} key={match.id} onClick={() => onSelect(match)}>{foodImages[match.id] ? <span className="match-photo" style={{ backgroundImage: `url(${foodImages[match.id]})` }} /> : <span className="match-emoji">{match.emoji}</span>}<span><strong>{match.emoji} {match.name}</strong><small>{match.description}</small></span><ChevronRight size={20} /></button>)}</div>})}</div> : <div className="empty-match"><div className="empty-icon">🍽️</div><h2>No shared cravings this round</h2><p>That happens. Fresh round, fresh chance to find your FoodMood.</p></div>}<div className="reveal-actions">{matches.length > 0 ? <p><Heart size={15} fill="currentColor" /> Choose a match to make it tonight’s FoodMood</p> : <button className="secondary-button full" onClick={onAnotherRound}><RotateCcw size={18} /> Start another round</button>}</div></div>;
}

function ChosenScreen({ food, round, onAnotherRound }: { food: FoodOption; round: number; onAnotherRound: () => void }) {
  return <div className="chosen-screen"><div className="success-burst"><Check size={38} strokeWidth={3} /></div><div className="eyebrow"><Sparkles size={16} /> Tonight’s FoodMood</div><h1>{food.name}<em>!</em></h1><p className="chosen-subtitle">You’re both craving it.</p><div className="chosen-hero" style={foodImages[food.id] ? { backgroundImage: `linear-gradient(180deg, rgba(17,28,45,.05), rgba(17,28,45,.35)), url(${foodImages[food.id]})` } : undefined}><span className="chosen-match-badge"><Flame size={15} /> Perfect match</span><span className="chosen-emoji">{food.emoji}</span><span className="chosen-hero-label"><Heart size={17} /> Unanimous craving</span></div><div className="decision-summary"><div><span className="summary-icon"><Sparkles size={17} /></span><div><small>Decision summary</small><strong>Indecision defeated</strong></div></div><span className="saved-pill"><CheckCircle2 size={15} /> Both agreed</span><div className="summary-stats"><span><small>Decided by</small><strong>Two people</strong></span><span><small>Round</small><strong>{round} complete</strong></span></div></div><button className="primary-button full" onClick={onAnotherRound}><RotateCcw size={18} /> Start another round</button><button className="text-button">Done with dinner decisions</button></div>;
}

function FooterHint() {
  return <footer className="footer-hint"><Clock3 size={15} /> A tiny decision now, a much better dinner later.</footer>;
}

export default App;
