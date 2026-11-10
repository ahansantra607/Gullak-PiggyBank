/* Gullak core: state, storage, money maths, badges. No real money, ever. */
window.G = window.G || {};
(function (G) {
  G.storeKey = 'gullak:v1'; // per-mode storage: Just me = gullak:v1, Sample = gullak:sample, Family = encrypted
  const DAY = 86400000;
  G.DAY = DAY;

  /* ---------- small helpers ---------- */
  G.uid = (n = 6) => {
    let s = '';
    while (s.length < n) s += Math.random().toString(36).slice(2).replace(/[^a-z0-9]/g, '');
    return s.slice(0, n).toUpperCase();
  };
  G.esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  G.rs = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  G.now = () => Date.now();
  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  G.dateStr = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  G.dayLabel = (ms) => {
    const d = new Date(ms); const t = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, t)) return 'Today';
    const y = new Date(t.getTime() - DAY);
    if (same(d, y)) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  G.weekStart = (ms) => {
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const wd = (d.getDay() + 6) % 7; // Monday = 0
    return d.getTime() - wd * DAY;
  };

  /* base64url for share links (unicode safe) */
  G.b64e = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  G.b64d = (str) => {
    try {
      let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return JSON.parse(decodeURIComponent(escape(atob(s))));
    } catch (e) { return null; }
  };
  G.appBase = () => location.href.split('#')[0];

  /* tiny non-crypto hash for the local grown-up PIN (it's a kid-lock, not a login) */
  G.hash = (str) => {
    let h = 5381; const s = 'gullak-salt-' + str;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /* ---------- catalogues ---------- */
  G.CATS = {
    snacks: { e: '🍦', n: 'Snacks' }, games: { e: '🎮', n: 'Games' }, toys: { e: '🧸', n: 'Toys' },
    school: { e: '✏️', n: 'School stuff' }, gifts: { e: '🎁', n: 'Gifts' }, travel: { e: '🚌', n: 'Travel' },
    clothes: { e: '👕', n: 'Clothes' }, fun: { e: '🎡', n: 'Fun & outings' }, other: { e: '❓', n: 'Other' },
    asked: { e: '🙋', n: 'Asked & approved' }, goal: { e: '🏆', n: 'Dream bought' }
  };
  G.SPEND_CATS = ['snacks', 'games', 'toys', 'school', 'gifts', 'travel', 'clothes', 'fun', 'other'];
  G.SOURCES = {
    pocket: { e: '💰', n: 'Pocket money' }, gift: { e: '🎁', n: 'Gift' },
    earned: { e: '🧹', n: 'Earned (chores)' }, other: { e: '✨', n: 'Other' }
  };
  G.UNITS = [
    { id: 'samosa', e: '🥟', one: 'samosa', many: 'samosas', price: 20 },
    { id: 'icecream', e: '🍦', one: 'ice cream', many: 'ice creams', price: 40 },
    { id: 'choc', e: '🍫', one: 'chocolate', many: 'chocolates', price: 10 },
    { id: 'panipuri', e: '🥙', one: 'pani puri plate', many: 'pani puri plates', price: 30 },
    { id: 'movie', e: '🎬', one: 'movie ticket', many: 'movie tickets', price: 200 },
    { id: 'goal', e: '🎯', one: '% of my dream', many: '% of my dream', price: 0 }
  ];
  G.GOAL_PRESETS = [
    { e: '🚲', n: 'Cycle', t: 5000 }, { e: '🎮', n: 'Video game', t: 2000 },
    { e: '⚽', n: 'Football', t: 800 }, { e: '📚', n: 'Story books', t: 500 },
    { e: '🎧', n: 'Headphones', t: 1500 }, { e: '🏏', n: 'Cricket bat', t: 1200 },
    { e: '🎨', n: 'Art kit', t: 700 }, { e: '🛹', n: 'Skateboard', t: 3000 }
  ];
  G.AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🦄', '🐙', '🚀', '⚡', '🌟', '🐲'];
  G.EMOJI_PICK = ['🎮', '🧸', '🍫', '🍦', '📚', '👟', '🎧', '⚽', '🏏', '🎨', '📱', '🎁', '🛹', '🚲', '🎟️', '👕', '🎲', '🪀'];
  G.REASONS = ['I\'ll use it every day', 'It\'s for school', 'It\'s on sale', 'I saved for it', 'Everyone has it', 'It makes me happy', 'It\'s a gift for someone'];

  /* ---------- state ---------- */
  const fresh = () => ({
    v: 1, profile: null, txns: [], goals: [], activeGoalId: null, requests: [], chores: [],
    badges: [], pinHash: null,
    settings: { unit: 'samosa', customUnit: null, sound: true, readAloud: false, coolHours: 24, coolMin: 200, matchPct: 0 },
    meta: { lastOpen: 0, prevOpen: 0, lastPayday: 0, savedByWaiting: 0, melaBest: 0, quizBest: 0, celebrated: {} }
  });
  G.fresh = fresh;

  G.load = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(G.storeKey)); } catch (e) { s = null; }
    const f = fresh();
    if (!s || typeof s !== 'object') return f;
    return Object.assign(f, s, {
      settings: Object.assign(f.settings, s.settings || {}),
      meta: Object.assign(f.meta, s.meta || {})
    });
  };
  G.save = () => { try { localStorage.setItem(G.storeKey, JSON.stringify(G.S)); } catch (e) { /* storage full / blocked */ } };
  G.S = G.load();

  /* ---------- derived money maths ---------- */
  /* Spendable money = in − out − moved to dreams + taken back from dreams. (goalSpend comes out of the dream jar.) */
  G.balance = (s = G.S) => s.txns.reduce((b, t) => {
    if (t.type === 'in' || t.type === 'fromGoal' || t.type === 'loanIn') return b + t.amount;
    if (t.type === 'out' || t.type === 'toGoal' || t.type === 'loanPay') return b - t.amount;
    return b;
  }, 0);

  G.goalSaved = (gid, s = G.S) => s.txns.reduce((b, t) => {
    if (t.goalId !== gid) return b;
    if (t.type === 'toGoal') return b + t.amount;
    if (t.type === 'fromGoal' || t.type === 'goalSpend') return b - t.amount;
    return b;
  }, 0);
  G.activeGoal = (s = G.S) => s.goals.find(g => g.id === s.activeGoalId && !g.boughtAt) ||
    s.goals.find(g => !g.boughtAt) || null;
  G.goalPct = (g, s = G.S) => g ? G.clamp(Math.round(G.goalSaved(g.id, s) / g.target * 100), 0, 100) : 0;
  G.totalInGoals = (s = G.S) => s.goals.filter(g => !g.boughtAt).reduce((a, g) => a + G.goalSaved(g.id, s), 0);

  G.weeklyPocket = (s = G.S) => {
    const p = s.profile; if (!p) return 0;
    return p.frequency === 'monthly' ? p.pocketMoney * 12 / 52 : p.pocketMoney;
  };
  const windowDays = (s) => {
    const since = s.profile ? (G.now() - s.profile.createdAt) / DAY : 7;
    return G.clamp(since, 7, 28);
  };
  G.avgWeeklySpend = (s = G.S) => {
    const wd = windowDays(s); const from = G.now() - wd * DAY;
    const spent = s.txns.filter(t => t.type === 'out' && t.date >= from).reduce((a, t) => a + t.amount, 0);
    return spent / (wd / 7);
  };
  G.avgWeeklyIncome = (s = G.S) => {
    const wd = windowDays(s); const from = G.now() - wd * DAY;
    const got = s.txns.filter(t => t.type === 'in' && t.date >= from).reduce((a, t) => a + t.amount, 0);
    return Math.max(got / (wd / 7), G.weeklyPocket(s));
  };
  /* How much a kid can realistically put away per day. Floors at 20% of income and ₹1/day. */
  G.dailySaving = (s = G.S) => {
    const inc = G.avgWeeklyIncome(s);
    const weekly = Math.max(inc - G.avgWeeklySpend(s), inc * 0.2, 7);
    return weekly / 7;
  };
  G.daysBack = (amount, s = G.S) => amount > 0 ? Math.ceil(amount / G.dailySaving(s)) : 0;
  G.daysToGoal = (g, s = G.S) => {
    if (!g) return 0;
    const rem = g.target - G.goalSaved(g.id, s);
    return rem <= 0 ? 0 : Math.ceil(rem / G.dailySaving(s));
  };

  /* a kid's home-made unit name is shown in many places: strip anything that could become HTML */
  const cleanTxt = (v) => String(v == null ? '' : v).replace(/[<>"'&`]/g, '').slice(0, 24);
  const customUnit = (s) => { const c = s.settings.customUnit; if (!c) return null;
    return { id: 'custom', e: cleanTxt(c.e).slice(0, 8) || '⭐', one: cleanTxt(c.one) || 'thing', many: cleanTxt(c.many) || 'things', price: Math.max(1, Number(c.price) || 1) }; };
  G.unitById = (id, s = G.S) => {
    if (id === 'custom' && s.settings.customUnit) return customUnit(s);
    return G.UNITS.find(u => u.id === id) || G.UNITS[0];
  };
  G.allUnits = (s = G.S) => s.settings.customUnit ? G.UNITS.concat([customUnit(s)]) : G.UNITS.slice();

  /* "₹500" → "25 samosas 🥟" */
  G.inUnits = (amount, unitId, s = G.S) => {
    const u = G.unitById(unitId || s.settings.unit, s);
    if (u.id === 'goal') {
      const g = G.activeGoal(s);
      if (!g) return { n: 0, text: 'no dream yet', e: '🎯' };
      const pct = Math.round(amount / g.target * 100);
      return { n: pct, text: pct + '% of your ' + g.name, e: g.emoji };
    }
    const n = Math.floor(Math.max(0, amount) / u.price);
    return { n, text: n + ' ' + (n === 1 ? u.one : u.many), e: u.e };
  };
  G.emojiRow = (n, e, max = 12) => {
    const k = Math.min(n, max);
    return e.repeat(Math.max(0, k)) + (n > max ? ' +' + (n - max) : '');
  };

  G.periodFrom = (period) => {
    if (period === 'week') return G.weekStart(G.now());
    if (period === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
    return 0;
  };
  G.spendBreakdown = (period, s = G.S) => {
    const from = G.periodFrom(period);
    const out = s.txns.filter(t => t.type === 'out' && t.date >= from);
    const by = {}; let total = 0, need = 0, want = 0;
    out.forEach(t => {
      by[t.category] = (by[t.category] || 0) + t.amount; total += t.amount;
      if (t.needOrWant === 'need') need += t.amount; else if (t.needOrWant === 'want') want += t.amount;
    });
    const rows = Object.keys(by).map(k => ({ cat: k, amount: by[k] })).sort((a, b) => b.amount - a.amount);
    const income = s.txns.filter(t => t.type === 'in' && t.date >= from).reduce((a, t) => a + t.amount, 0);
    const saved = s.txns.filter(t => t.type === 'toGoal' && t.date >= from).reduce((a, t) => a + t.amount, 0)
      - s.txns.filter(t => t.type === 'fromGoal' && t.date >= from).reduce((a, t) => a + t.amount, 0);
    return { rows, total, need, want, income, saved, count: out.length };
  };

  G.insight = (period, s = G.S) => {
    const b = G.spendBreakdown(period, s);
    const when = period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'So far';
    if (!b.count) return when + ' you haven\'t spent anything. Your Gullak is proud of you! 🐷';
    const top = b.rows[0]; const c = G.CATS[top.cat] || G.CATS.other;
    const pct = Math.round(top.amount / b.total * 100);
    const u = G.inUnits(top.amount, s.settings.unit === 'goal' ? 'samosa' : s.settings.unit, s);
    let msg = `${when}, ${c.n.toLowerCase()} ${c.e} ate ${pct}% of your spending. That's ${u.text}!`;
    if (b.want > b.need && b.want > 0) msg += ' Most of it was on wants. 🤔';
    const g = G.activeGoal(s);
    if (g) msg += ` Without it, your ${g.name} would come ${G.plural(G.daysBack(top.amount, s), 'day')} sooner.`;
    return msg;
  };

  G.weekBars = (weeks = 6, s = G.S) => {
    const ws = G.weekStart(G.now()); const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const a = ws - i * 7 * DAY, b = a + 7 * DAY;
      const sum = (type) => s.txns.filter(t => t.type === type && t.date >= a && t.date < b).reduce((x, t) => x + t.amount, 0);
      out.push({ start: a, spent: sum('out'), saved: sum('toGoal') - sum('fromGoal'), got: sum('in') });
    }
    return out;
  };

  G.streak = (s = G.S) => {
    const weeks = new Set(s.txns.filter(t => t.type === 'toGoal').map(t => G.weekStart(t.date)));
    let w = G.weekStart(G.now()); if (!weeks.has(w)) w -= 7 * DAY;
    let n = 0; while (weeks.has(w)) { n++; w -= 7 * DAY; }
    return n;
  };

  G.report = (s = G.S) => {
    const b = G.spendBreakdown('week', s);
    const ratio = b.income > 0 ? (b.income - b.total) / b.income : (b.total === 0 ? 1 : 0);
    let stars = 1;
    if (ratio >= 0.1) stars = 2; if (ratio >= 0.25) stars = 3; if (ratio >= 0.4) stars = 4; if (ratio >= 0.6) stars = 5;
    if (b.want > b.need * 3 && stars > 1) stars--;
    const tips = [
      [1, 'Try the 3-jar rule: Spend some, Save some, Share some.'],
      [2, 'Before buying a want, wait one night. If you still want it tomorrow, it\'s real!'],
      [3, 'Nice! Try moving money to your dream on pocket-money day, before spending.'],
      [4, 'Super saver! Can you keep your saving streak going next week?'],
      [5, 'Money master! You saved most of what you got. 🏆']
    ];
    return Object.assign(b, { stars, tip: tips[stars - 1][1], streak: G.streak(s) });
  };

  /* ---------- pocket money day ---------- */
  G.paydayDue = (s = G.S) => {
    const p = s.profile; if (!p || !p.pocketMoney) return false;
    const period = p.frequency === 'monthly' ? 30 : 7;
    return G.now() - (s.meta.lastPayday || p.createdAt) >= period * DAY;
  };

  /* ---------- Gullak's mood ---------- */
  G.mood = (s = G.S) => {
    const g = G.activeGoal(s); const bal = G.balance(s);
    const name = s.profile ? s.profile.nickname : 'friend';
    const done = s.goals.find(x => !x.boughtAt && G.goalSaved(x.id, s) >= x.target);
    if (done) return { mood: 'proud', msg: `WE DID IT, ${name}! Your ${done.name} ${done.emoji} money is ready!` };
    const away = s.meta.prevOpen ? (G.now() - s.meta.prevOpen) / DAY : 0;
    if (away >= 3) return { mood: 'sleepy', msg: `Yawn… I missed you for ${Math.floor(away)} days! Did you spend anything?` };
    const wk = G.spendBreakdown('week', s);
    if (bal <= 0 && s.txns.length) return { mood: 'worried', msg: 'Uh-oh, my tummy is empty! Let\'s not spend for a bit.' };
    if (wk.income > 0 && wk.total > wk.income) return { mood: 'worried', msg: 'This week we spent more than we got. Careful!' };
    if (g && G.goalPct(g, s) >= 75) return { mood: 'excited', msg: `So close! Only ${G.rs(g.target - G.goalSaved(g.id, s))} to your ${g.name}!` };
    const recentSave = s.txns.some(t => t.type === 'toGoal' && t.date > G.now() - 7 * DAY);
    if (recentSave) return { mood: 'happy', msg: 'Yum, you fed me savings this week! Oink oink! 🪙' };
    if (!g) return { mood: 'calm', msg: 'What are we saving for? Let\'s pick a dream!' };
    return { mood: 'calm', msg: `Feed me a little every week and we'll get your ${g.name} ${g.emoji}!` };
  };

  /* ---------- badges ---------- */
  G.BADGES = [
    { id: 'first-log', e: '📝', n: 'First Note', d: 'Wrote down your first spend', t: s => s.txns.some(t => t.type === 'out') },
    { id: 'first-save', e: '🪙', n: 'First Coin', d: 'Put money in your dream jar', t: s => s.txns.some(t => t.type === 'toGoal') },
    { id: 'dreamer', e: '🌈', n: 'Dreamer', d: 'Picked a dream to save for', t: s => s.goals.length > 0 },
    { id: 'quarter', e: '🥉', n: 'Quarter Way', d: 'Reached 25% of a dream', t: s => s.goals.some(g => G.goalPct(g, s) >= 25 || g.boughtAt) },
    { id: 'half', e: '🥈', n: 'Halfway Hero', d: 'Reached 50% of a dream', t: s => s.goals.some(g => G.goalPct(g, s) >= 50 || g.boughtAt) },
    { id: 'full', e: '🥇', n: 'Dream Catcher', d: 'Saved 100% for a dream', t: s => s.goals.some(g => G.goalPct(g, s) >= 100 || g.boughtAt) },
    { id: 'streak3', e: '🔥', n: 'On Fire', d: 'Saved 3 weeks in a row', t: s => G.streak(s) >= 3 },
    { id: 'asker', e: '🙋', n: 'Smart Asker', d: 'Asked a grown-up before buying', t: s => s.requests.length > 0 },
    { id: 'waiter', e: '🧊', n: 'Cool Head', d: 'Waited it out and didn\'t buy', t: s => s.meta.savedByWaiting > 0 },
    { id: 'helper', e: '🧹', n: 'Helping Hand', d: 'Earned money doing a chore', t: s => s.txns.some(t => t.type === 'in' && t.category === 'earned') },
    { id: 'need-want', e: '🧠', n: 'Need/Want Whiz', d: 'Scored 8+ in the Need or Want game', t: s => s.meta.quizBest >= 8 },
    { id: 'mela', e: '🎪', n: 'Mela Master', d: 'Got 3 stars at Mela Day', t: s => s.meta.melaBest >= 3 },
    { id: 'logger', e: '📅', n: 'Money Diary', d: 'Logged spends on 5 different days', t: s => new Set(s.txns.filter(t => t.type === 'out').map(t => new Date(t.date).toDateString())).size >= 5 },
    { id: 'bought', e: '🏆', n: 'Got My Dream', d: 'Bought something you saved for', t: s => s.goals.some(g => g.boughtAt) }
  ];
  G.checkBadges = (s = G.S) => {
    const have = new Set(s.badges.map(b => b.id)); const fresh = [];
    G.BADGES.forEach(b => { if (!have.has(b.id) && b.t(s)) { s.badges.push({ id: b.id, at: G.now() }); fresh.push(b); } });
    return fresh;
  };

  /* ---------- actions (all mutate G.S then save) ---------- */
  const A = G.act = {};
  A.addTxn = (t) => {
    const tx = Object.assign({ id: G.uid(8), date: G.now() }, t);
    tx.amount = Math.round(Number(tx.amount) || 0);
    if (tx.amount <= 0) return null;
    G.S.txns.push(tx); G.save(); return tx;
  };
  /* Save into a dream. If a grown-up set a "match" (like a mini bank bonus), add it too. Returns bonus. */
  /* Save into a dream, capped at the remaining target. */
  A.saveToGoal = (gid, amount) => {
    const g = G.S.goals.find(x => x.id === gid); if (!g) return 0;
    const saved = G.goalSaved(gid);
    const rem = Math.max(0, g.target - saved);
    amount = Math.min(Math.round(amount), rem);
    if (amount <= 0) return 0;

    const t = A.addTxn({ type: 'toGoal', amount, goalId: gid }); if (!t) return 0;
    const pct = Number(G.S.settings.matchPct) || 0;
    const bonus = Math.floor(amount * pct / 100);
    if (bonus > 0) {
      const bonusRem = Math.max(0, g.target - G.goalSaved(gid));
      const finalBonus = Math.min(bonus, bonusRem);
      if (finalBonus > 0) {
        A.addTxn({ type: 'in', amount: finalBonus, category: 'gift', note: '🤝 Grown-up match bonus' });
        A.addTxn({ type: 'toGoal', amount: finalBonus, goalId: gid, note: 'Match bonus' });
      }
    }
    return bonus;
  };
  A.deleteTxn = (id) => { G.S.txns = G.S.txns.filter(t => t.id !== id); G.save(); };
  A.addGoal = (g) => {
    const goal = Object.assign({ id: G.uid(6), createdAt: G.now() }, g);
    goal.target = Math.round(goal.target);
    G.S.goals.push(goal); G.S.activeGoalId = goal.id; G.save(); return goal;
  };
  A.buyGoal = (gid) => {
    const g = G.S.goals.find(x => x.id === gid); if (!g) return;
    const saved = G.goalSaved(gid);
    if (saved > 0) G.S.txns.push({ id: G.uid(8), type: 'goalSpend', amount: saved, goalId: gid, category: 'goal', date: G.now(), note: g.name });
    g.boughtAt = G.now();
    const next = G.S.goals.find(x => !x.boughtAt); G.S.activeGoalId = next ? next.id : null;
    G.save();
  };
  A.deleteGoal = (gid) => {
    const saved = G.goalSaved(gid);
    if (saved > 0) A.addTxn({ type: 'fromGoal', amount: saved, goalId: gid, note: 'Dream removed' });
    G.S.goals = G.S.goals.filter(g => g.id !== gid);
    G.S.txns = G.S.txns.map(t => t.goalId === gid ? Object.assign({}, t, { goalId: null }) : t);
    if (G.S.activeGoalId === gid) G.S.activeGoalId = (G.S.goals.find(g => !g.boughtAt) || {}).id || null;
    G.save();
  };

  /* Apply a grown-up decision to a request. Works for same-device and reply links. */
  A.decide = (reqId, status, note) => {
    const r = G.S.requests.find(x => x.id === reqId);
    if (!r) return { ok: false, why: 'missing' };
    if (r.status === 'approved' || r.status === 'declined') return { ok: false, why: 'already', r };
    r.status = status; r.parentNote = note || ''; r.decidedAt = G.now();
    if (status === 'half') { r.status = 'approved'; r.kidPays = Math.round(r.price / 2); r.deal = 'half'; }
    if (r.status === 'approved' && r.kidPays > 0) {
      A.addTxn({ type: 'out', amount: r.kidPays, category: 'asked', needOrWant: r.needOrWant, note: r.item + ' (approved)', requestId: r.id });
    }
    if (status === 'wait') r.waitUntil = G.now() + 7 * DAY;
    G.save(); return { ok: true, r };
  };

  /* ---------- sample data so judges can explore instantly ---------- */
  A.loadSample = () => {
    const s = fresh(); const t0 = G.now(); const d = (n) => t0 - n * DAY;
    s.profile = { nickname: 'Rocket', avatar: '🚀', ageGroup: 'junior', pocketMoney: 200, frequency: 'weekly', createdAt: d(24) };
    s.settings = Object.assign(s.settings, { unit: 'samosa', readAloud: false, matchPct: 10 });
    const goal = { id: 'CYCLE1', name: 'Cycle', emoji: '🚲', target: 2500, createdAt: d(24) };
    s.goals = [goal]; s.activeGoalId = goal.id;
    const tx = (o) => s.txns.push(Object.assign({ id: G.uid(8) }, o));
    [24, 17, 10, 3].forEach(n => {
      tx({ type: 'in', amount: 200, category: 'pocket', date: d(n) });
      tx({ type: 'toGoal', amount: 70, goalId: goal.id, date: d(n) + 3600e3 });
    });
    tx({ type: 'in', amount: 800, category: 'gift', note: 'Birthday money from Nani', date: d(20) });
    tx({ type: 'toGoal', amount: 400, goalId: goal.id, date: d(20) + 3600e3 });
    tx({ type: 'in', amount: 50, category: 'earned', note: 'Washed the car', date: d(6) });
    [[22, 40, 'snacks', 'want', 'Ice cream'], [21, 20, 'snacks', 'want', 'Samosa'], [19, 60, 'school', 'need', 'Notebook'],
     [15, 120, 'games', 'want', 'Game coins'], [13, 20, 'snacks', 'want', 'Samosa'], [9, 30, 'travel', 'need', 'Auto to tuition'],
     [8, 40, 'snacks', 'want', 'Ice cream'], [5, 80, 'gifts', 'want', 'Friend\'s gift'], [2, 20, 'snacks', 'want', 'Chips'],
     [1, 30, 'snacks', 'want', 'Pani puri'], [0, 25, 'school', 'need', 'Pens']]
      .forEach(([n, a, c, nw, note]) => tx({ type: 'out', amount: a, category: c, needOrWant: nw, note, date: d(n) + 7200e3 }));
    s.requests = [
      { id: 'R7K2Q', item: 'Robot toy', emoji: '🤖', price: 600, needOrWant: 'want', reasons: ['It makes me happy'], kidPays: 300, status: 'declined', seen: true, parentNote: 'Let\'s wait for your birthday!', createdAt: d(12), decidedAt: d(11) },
      { id: 'RB4ZN', item: 'Football', emoji: '⚽', price: 400, needOrWant: 'want', reasons: ['I\'ll use it every day'], kidPays: 100, status: 'approved', seen: true, parentNote: 'Great reason. Play every evening!', createdAt: d(7), decidedAt: d(7) },
      { id: 'RQ9TM', item: 'Comic book', emoji: '📚', price: 250, needOrWant: 'want', reasons: ['I saved for it'], kidPays: 125, status: 'pending', createdAt: d(0) }
    ];
    tx({ type: 'out', amount: 100, category: 'asked', needOrWant: 'want', note: 'Football (approved)', requestId: 'RB4ZN', date: d(7) });
    s.chores = [
      { id: 'C1', name: 'Water the plants', emoji: '🪴', reward: 20, status: 'open' },
      { id: 'C2', name: 'Tidy my room', emoji: '🧺', reward: 30, status: 'done' },
      { id: 'C3', name: 'Wash the car', emoji: '🚗', reward: 50, status: 'paid' }
    ];
    s.pinHash = G.hash('1234');
    s.meta.lastPayday = d(3); s.meta.lastOpen = t0; s.meta.prevOpen = t0; s.meta.sample = true;
    G.S = s; G.checkBadges(s); s.meta.celebrated = { [goal.id + ':25']: 1 }; G.save();
  };
})(window.G);
