/* Gullak extras: Games hub, Mela Day, Need-or-Want, Future Me, Report Card, Badges, Settings. */
(function (G) {
  const S = () => G.S; const esc = G.esc, rs = G.rs;
  G.screens = G.screens || {};
  const back = (title, to = 'home') => `<header class="page-h"><button class="back" data-act="go" data-to="${to}" aria-label="Back">←</button><h1>${title}</h1></header>`;

  /* ---------- Games hub ---------- */
  G.screens.play = {
    nav: 'play',
    render: () => `${back('🎪 Play & learn')}
      <button class="game-card mela" data-act="go" data-to="mela"><span>🎪</span><div><b>Mela Day</b><small>You have ₹200 at the fair. Can you eat, have fun AND get home?</small>
        ${S().meta.melaBest ? `<small>Best: ${G.stars(S().meta.melaBest, 3)}</small>` : ''}</div></button>
      <button class="game-card quiz" data-act="go" data-to="quiz"><span>🧠</span><div><b>Need or Want?</b><small>Sort 10 things. How smart is your money brain?</small>
        ${S().meta.quizBest ? `<small>Best: ${S().meta.quizBest}/10</small>` : ''}</div></button>
      <button class="game-card future" data-act="go" data-to="future"><span>🔮</span><div><b>Future Me</b><small>Time-travel to see what saving a little each week becomes.</small></div></button>
      <button class="game-card report" data-act="go" data-to="report"><span>📊</span><div><b>My Report Card</b><small>Your money stars for this week.</small></div></button>
      <button class="game-card badges" data-act="go" data-to="badges"><span>🏅</span><div><b>Badges</b><small>${S().badges.length} of ${G.BADGES.length} collected</small></div></button>`,
    handlers: () => ({})
  };

  /* ---------- Mela Day: a budgeting mini-game ---------- */
  const STALLS = [
    { id: 'food', e: '🍛', n: 'Food stall', items: [
      { id: 'thali', e: '🍛', n: 'Thali lunch', p: 60, k: 'lunch' }, { id: 'water', e: '💧', n: 'Water bottle', p: 20, k: 'water' },
      { id: 'floss', e: '🍭', n: 'Candy floss', p: 30, k: 'treat' }, { id: 'kulfi', e: '🍦', n: 'Kulfi', p: 25, k: 'treat' }] },
    { id: 'rides', e: '🎡', n: 'Rides', items: [
      { id: 'wheel', e: '🎡', n: 'Giant wheel', p: 50, k: 'fun' }, { id: 'merry', e: '🎠', n: 'Merry-go-round', p: 25, k: 'fun' }] },
    { id: 'games', e: '🎯', n: 'Games', items: [
      { id: 'ring', e: '💍', n: 'Ring toss (win a teddy?)', p: 40, k: 'fun', luck: true }, { id: 'shoot', e: '🎯', n: 'Balloon shoot', p: 20, k: 'fun' }] },
    { id: 'toys', e: '🧸', n: 'Toy shop', items: [
      { id: 'sword', e: '⚔️', n: 'Light-up sword', p: 80, k: 'toy' }, { id: 'balloon', e: '🎈', n: 'Big balloon', p: 20, k: 'toy' }] },
    { id: 'bus', e: '🚌', n: 'Bus stand', items: [{ id: 'bus', e: '🚌', n: 'Bus ticket home', p: 30, k: 'bus' }] }
  ];
  /* Money maths (always true): money = START − spent + surprise.
     Smartest route: bus 30 + lunch 60 + water 20 + cheapest 2 fun (20 + 25) = ₹155 → ₹45 left,
     still ≥ ₹20 even after the "dropped ₹20" surprise, so a perfect game is always possible. */
  const START = 200, SAVE_GOAL = 20, DROP = 20, GIFT = 20;
  const mela = { started: false, money: START, spent: 0, surprise: 0, bought: 0, cart: [], stall: 'food', event: false, over: false, log: [] };
  const melaReset = () => Object.assign(mela, { started: true, money: START, spent: 0, surprise: 0, bought: 0, cart: [], stall: 'food', event: false, over: false, log: [] });
  G._mela = mela; // exposed for testing
  const missions = () => {
    const has = (k) => mela.cart.filter(c => c.k === k).length;
    return [
      { e: '🚌', n: 'Get home safely (bus ticket)', ok: has('bus') > 0 },
      { e: '🍛', n: 'Eat lunch', ok: has('lunch') > 0 },
      { e: '💧', n: 'Drink water', ok: has('water') > 0 },
      { e: '🎉', n: 'Have fun (2 rides or games)', ok: has('fun') >= 2 },
      { e: '🐷', n: `Bring ₹${SAVE_GOAL}+ home for your Gullak`, ok: mela.money >= SAVE_GOAL }
    ];
  };
  G.screens.mela = {
    render: () => {
      if (!mela.started) return `${back('🎪 Mela Day', 'play')}<section class="card center">
        <div class="huge">🎪</div><h2>Welcome to the Mela!</h2>
        <p>You have <b>${rs(START)}</b>. Your missions:</p>
        <ul class="missions">${missions().map(m => `<li>${m.e} ${m.n}</li>`).join('')}</ul>
        <p class="muted small">Careful: surprises can happen at a mela… 👀</p>
        <button class="btn primary big block" data-act="start">Enter the Mela!</button></section>`;
      const ms = missions(); const done = ms.filter(m => m.ok).length;
      if (mela.over) {
        const stars = done >= 5 ? 3 : done >= 4 ? 2 : done >= 3 ? 1 : 0;
        const lesson = !ms[0].ok ? 'Uh-oh, no bus ticket! Always keep money for the things you MUST have first. 🚌'
          : !ms[1].ok ? 'You forgot lunch! Needs first, then wants. 🍛'
          : !ms[4].ok ? 'You spent almost everything. Try keeping a little for your Gullak next time. 🐷'
          : !ms[3].ok ? 'You saved well! You can have a bit more fun next time too. 🎡'
          : 'PERFECT! Needs first, fun second, savings kept. You\'re a money master! 🏆';
        return `${back('🎪 Mela Day', 'play')}<section class="card center">
          <h2>${stars === 3 ? '🏆 Mela Master!' : stars ? 'Nice trip!' : 'Try again!'}</h2>${G.stars(stars, 3)}
          <ul class="missions res">${ms.map(m => `<li class="${m.ok ? 'ok' : 'no'}">${m.ok ? '✅' : '❌'} ${m.e} ${m.n}</li>`).join('')}</ul>
          <div class="impact mela-sum">
            <div class="kv"><span>💰 You started with</span><b>${rs(START)}</b></div>
            <div class="kv"><span>🛍️ You spent (${G.plural(mela.bought, 'thing')})</span><b class="minus">−${rs(mela.spent)}</b></div>
            ${mela.surprise ? `<div class="kv"><span>${mela.surprise > 0 ? '🎁 Aunty gave you' : '😱 You dropped'}</span><b class="${mela.surprise > 0 ? 'plus' : 'minus'}">${mela.surprise > 0 ? '+' : '−'}${rs(Math.abs(mela.surprise))}</b></div>` : ''}
            <div class="kv big"><span>🐷 You came home with</span><b>${rs(mela.money)}</b></div>
          </div>
          <div class="cart">${mela.cart.map(c => c.e).join(' ') || 'nothing'}</div>
          <p class="lesson">${lesson}</p>${G.speakBtn(lesson)}
          <button class="btn primary big block" data-act="start">Play again</button>
          <button class="btn ghost block" data-act="go" data-to="play">Back to games</button></section>`;
      }
      const stall = STALLS.find(s => s.id === mela.stall);
      return `${back('🎪 Mela Day', 'play')}
        <section class="card mela-top"><div class="row between"><div><small>Money left</small><div class="bal sm">${rs(mela.money)}</div></div>
          <div class="right"><small>Missions</small><div>${ms.map(m => `<span class="m ${m.ok ? 'ok' : ''}" title="${m.n}">${m.e}</span>`).join('')}</div></div></div>
          ${G.progress(mela.money / START * 100)}<small class="muted">Spent ${rs(mela.spent)}${mela.surprise ? ` · surprise ${mela.surprise > 0 ? '+' : '−'}${rs(Math.abs(mela.surprise))}` : ''}</small></section>
        <div class="tabs">${STALLS.map(s => `<button class="tab ${s.id === mela.stall ? 'on' : ''}" data-act="stall" data-v="${s.id}">${s.e} ${s.n}</button>`).join('')}</div>
        <section class="card"><div class="stall">${stall.items.map(i => `<button class="item" data-act="buy" data-s="${stall.id}" data-i="${i.id}" ${i.p > mela.money ? 'disabled' : ''}>
          <span>${i.e}</span><b>${i.n}</b><small>${rs(i.p)}</small></button>`).join('')}</div></section>
        <section class="card"><div class="label">In your bag</div><div class="cart">${mela.cart.map(c => c.e).join(' ') || '<span class="muted">Empty</span>'}</div>
          <div class="log">${mela.log.slice(-3).reverse().map(l => `<small>${l}</small>`).join('')}</div></section>
        <button class="btn primary big block" data-act="home">🏠 Go home</button>`;
    },
    handlers: () => ({
      start: () => { melaReset(); G.sound('pop'); G.render(); },
      stall: (el) => { mela.stall = el.dataset.v; G.render(); },
      buy: (el) => {
        const st = STALLS.find(s => s.id === el.dataset.s); const it = st.items.find(i => i.id === el.dataset.i);
        if (it.p > mela.money) return;
        mela.money -= it.p; mela.spent += it.p; mela.bought++;
        mela.cart.push({ e: it.e, k: it.k }); mela.log.push(`Bought ${it.e} ${it.n} −${rs(it.p)}`); G.sound('coin');
        if (it.luck && Math.random() < 0.4) { mela.cart.push({ e: '🧸', k: 'prize' }); mela.log.push('🎉 You won a teddy (free)!'); G.toast('🎉 You won a teddy! 🧸'); }
        if (!mela.event && mela.bought >= 3) { // after the 3rd real purchase (a free prize doesn't count)
          mela.event = true;
          if (mela.money >= DROP && Math.random() < 0.5) {
            mela.money -= DROP; mela.surprise -= DROP; mela.log.push(`😱 Oops! You dropped ${rs(DROP)}`);
            setTimeout(() => G.toast(`😱 Oh no! You dropped ${rs(DROP)} in the crowd. That's why we keep a little extra!`, 4200), 300);
          } else {
            mela.money += GIFT; mela.surprise += GIFT; mela.log.push(`🎁 Aunty gave you ${rs(GIFT)}!`);
            setTimeout(() => G.toast(`🎁 You met Aunty! She gave you ${rs(GIFT)}.`, 3500), 300);
          }
        }
        G.render();
      },
      home: async () => {
        if (!missions()[0].ok && !(await G.confirm('No bus ticket! 🚌', 'How will you get home? Go home anyway?', 'Go anyway', 'Wait, let me buy one'))) return;
        mela.over = true; const done = missions().filter(m => m.ok).length; const stars = done >= 5 ? 3 : done >= 4 ? 2 : done >= 3 ? 1 : 0;
        S().meta.melaBest = Math.max(S().meta.melaBest || 0, stars); G.save();
        if (stars === 3) { G.confetti(); G.sound('win'); } G.after(); G.render();
      }
    })
  };

  /* ---------- Need or Want quiz ---------- */
  const QUIZ = [
    ['👟', 'School shoes (old ones are torn)', 'need', 'You need shoes to walk to school safely.'],
    ['📱', 'A cool new phone cover', 'want', 'Nice to have, but your phone works without it.'],
    ['💧', 'Drinking water', 'need', 'Everybody needs water to stay healthy!'],
    ['🎮', 'A new video game', 'want', 'Fun, but you can live without it.'],
    ['💊', 'Medicine when you\'re sick', 'need', 'Health always comes first.'],
    ['🪥', 'A toothbrush', 'need', 'Clean teeth = happy you.'],
    ['🎬', 'A movie ticket', 'want', 'A treat, not a must-have.'],
    ['🧥', 'A raincoat in monsoon', 'need', 'It keeps you dry and healthy.'],
    ['🏏', 'A new bat when your old one works fine', 'want', 'If the old one works, a new one is a want.'],
    ['📒', 'Notebook for homework', 'need', 'You need it for school.'],
    ['🍬', 'Candy at the shop', 'want', 'Yummy, but a want.'],
    ['🚌', 'Bus fare to school', 'need', 'You need to reach school.'],
    ['🧸', 'The 5th teddy for your shelf', 'want', 'You already have 4 friends there!'],
    ['🍎', 'Healthy food for lunch', 'need', 'Food gives you energy.'],
    ['✨', 'Glitter stickers', 'want', 'Pretty, but a want.']
  ];
  const quiz = { list: [], i: 0, score: 0, last: null };
  const quizStart = () => { quiz.list = QUIZ.slice().sort(() => Math.random() - 0.5).slice(0, 10); quiz.i = 0; quiz.score = 0; quiz.last = null; };
  G.screens.quiz = {
    render: () => {
      if (!quiz.list.length) quizStart();
      if (quiz.i >= quiz.list.length) {
        const sc = quiz.score;
        return `${back('🧠 Need or Want?', 'play')}<section class="card center"><div class="huge">${sc >= 8 ? '🧠' : sc >= 5 ? '👍' : '🌱'}</div>
          <h2>You got ${sc} / 10</h2><p>${sc >= 8 ? 'Money brain level: GENIUS!' : sc >= 5 ? 'Good job! A little more practice.' : 'Keep learning, you\'ll get it!'}</p>
          <p class="muted small">Tip: A <b>need</b> is something you must have to be safe, healthy or go to school. A <b>want</b> makes life more fun.</p>
          <button class="btn primary big block" data-act="restart">Play again</button><button class="btn ghost block" data-act="go" data-to="play">Back to games</button></section>`;
      }
      const q = quiz.list[quiz.i];
      return `${back('🧠 Need or Want?', 'play')}
        <div class="quiz-top"><span>${quiz.i + 1} / 10</span><span>⭐ ${quiz.score}</span></div>${G.progress(quiz.i * 10)}
        ${quiz.last ? `<div class="banner ${quiz.last.ok ? 'good' : 'bad'}">${quiz.last.ok ? '✅ Right!' : '❌ Not quite.'} ${esc(quiz.last.why)}</div>` : ''}
        <section class="card center quiz-card"><div class="huge">${q[0]}</div><h2>${esc(q[1])}</h2>${G.speakBtn(q[1] + '. Need or want?')}</section>
        <div class="row gap"><button class="btn need-b grow big" data-act="ans" data-v="need">🧩 Need</button><button class="btn want-b grow big" data-act="ans" data-v="want">✨ Want</button></div>`;
    },
    handlers: () => ({
      ans: (el) => {
        const q = quiz.list[quiz.i]; const ok = el.dataset.v === q[2];
        if (ok) { quiz.score++; G.sound('coin'); } else G.sound('bad');
        quiz.last = { ok, why: q[3] }; quiz.i++;
        if (quiz.i >= quiz.list.length) { S().meta.quizBest = Math.max(S().meta.quizBest || 0, quiz.score); G.save(); if (quiz.score >= 8) G.confetti(); G.after(); }
        G.render();
      },
      restart: () => { quizStart(); G.render(); }
    })
  };

  /* ---------- Future Me: time-travel savings ---------- */
  const fut = { weekly: 50, weeks: 52, grow: false };
  G.screens.future = {
    render: () => {
      const senior = S().profile && S().profile.ageGroup === 'senior';
      const match = Number(S().settings.matchPct) || 0;
      const r = 0.08 / 52;
      const plain = fut.weekly * fut.weeks;
      const withMatch = Math.round(plain * (1 + match / 100));
      const grown = Math.round(fut.weekly * (1 + match / 100) * ((Math.pow(1 + r, fut.weeks) - 1) / r));
      const total = fut.grow ? grown : withMatch;
      const can = G.GOAL_PRESETS.filter(p => p.t <= total).sort((a, b) => b.t - a.t).slice(0, 4);
      const when = new Date(G.now() + fut.weeks * 7 * G.DAY).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const u = G.inUnits(total, 'samosa');
      return `${back('🔮 Future Me', 'play')}
        <section class="card center future-hero"><div class="huge">🧒➡️🧑</div>
          <p>If I save <b>${rs(fut.weekly)}</b> every week for <b>${G.plural(fut.weeks, 'week')}</b>…</p>
          <div class="bal">${rs(total)}</div><small>by ${when}</small>
          <div class="erow big">${G.emojiRow(Math.min(30, Math.floor(total / 100)), '🪙', 30)}</div>
          <p class="muted">= ${u.text} 🥟</p></section>
        <section class="card">
          <div class="label">Save each week: <b>${rs(fut.weekly)}</b></div>
          <input type="range" class="range" id="f-w" min="10" max="500" step="10" value="${fut.weekly}" aria-label="Weekly saving">
          <div class="label">For how long: <b>${G.plural(fut.weeks, 'week')}</b></div>
          <input type="range" class="range" id="f-n" min="4" max="156" step="1" value="${fut.weeks}" aria-label="Number of weeks">
          <div class="chips">${[[4, '1 month'], [26, '6 months'], [52, '1 year'], [104, '2 years'], [156, '3 years']].map(([w, n]) => `<button class="chip ${fut.weeks === w ? 'on' : ''}" data-act="weeks" data-v="${w}">${n}</button>`).join('')}</div>
          ${match ? `<p class="small">🤝 Includes your grown-up's ${match}% match!</p>` : ''}
          ${senior ? `<label class="toggle"><input type="checkbox" id="f-g" ${fut.grow ? 'checked' : ''}> 🌱 Show "growth magic" (8% a year, like a savings account)</label>
            <p class="small muted">Without growth: ${rs(withMatch)} · With growth: ${rs(grown)}. Money that grows on top of money is called <b>compound interest</b>.</p>` : ''}
        </section>
        <section class="card"><h3>🛍️ Future you could buy…</h3>
          ${can.length ? `<div class="pick-grid four">${can.map(p => `<div class="pick static"><span>${p.e}</span><small>${p.n}<br>${rs(p.t)}</small></div>`).join('')}</div>` : '<p class="muted">Keep sliding! Save a bit more to unlock dreams.</p>'}
          <p class="small muted">If you spend it all every week instead: ${rs(0)} saved. 😮</p></section>`;
    },
    after: (root) => {
      const w = G.$('#f-w', root), n = G.$('#f-n', root), g = G.$('#f-g', root);
      const live = () => { fut.weekly = +w.value; fut.weeks = +n.value; if (g) fut.grow = g.checked; G.render({ keepScroll: true }); };
      w.addEventListener('change', live); n.addEventListener('change', live); if (g) g.addEventListener('change', live);
      w.addEventListener('input', () => { G.$('.label b', root).textContent = rs(+w.value); });
      n.addEventListener('input', () => { G.$$('.label b', root)[1].textContent = G.plural(+n.value, 'week'); });
    },
    handlers: () => ({ weeks: (el) => { fut.weeks = +el.dataset.v; G.render({ keepScroll: true }); } })
  };

  /* ---------- Weekly Report Card ---------- */
  G.screens.report = {
    render: (q = {}) => {
      const gu = !!q.gu && G.parentUnlocked; // opened from Grown-up mode: stay inside it
      const r = G.report(); const top = r.rows[0]; const c = top ? (G.CATS[top.cat] || G.CATS.other) : null;
      const weekBadges = S().badges.filter(b => b.at >= G.weekStart(G.now())).map(b => G.BADGES.find(x => x.id === b.id)).filter(Boolean);
      const say = `This week you got ${rs(r.income)}, spent ${rs(r.total)} and saved ${rs(r.saved)}. You earned ${r.stars} stars. ${r.tip}`;
      const page = `${back(gu ? `📊 ${esc(S().profile.nickname)}'s report` : '📊 My Report Card', gu ? 'grownup' : 'home')}`;
      return `${gu ? '<p class="sup-tag">🔒 Grown-up mode</p>' : ''}${page}
        <section class="card center report-card"><small>Week of ${G.dateStr(G.weekStart(G.now()))}</small>
          <h2>${esc(S().profile.avatar)} ${esc(S().profile.nickname)}'s money stars</h2>${G.stars(r.stars)} ${G.speakBtn(say)}
          <div class="grid3"><div><small>💰 Got</small><b>${rs(r.income)}</b></div><div><small>💸 Spent</small><b>${rs(r.total)}</b></div><div><small>🔐 Saved</small><b>${rs(r.saved)}</b></div></div></section>
        <section class="card">
          <div class="kv"><span>🏷️ Biggest spend</span><b>${c ? `${c.e} ${c.n} (${rs(top.amount)})` : 'Nothing! 🌟'}</b></div>
          <div class="kv"><span>🧩 Needs / ✨ Wants</span><b>${rs(r.need)} / ${rs(r.want)}</b></div>
          <div class="kv"><span>🔥 Saving streak</span><b>${G.plural(r.streak, 'week')}</b></div>
          <div class="kv"><span>🏅 New badges</span><b>${weekBadges.length ? weekBadges.map(b => b.e).join(' ') : 'None yet'}</b></div>
          <div class="kv"><span>🧊 Saved by waiting</span><b>${rs(S().meta.savedByWaiting || 0)}</b></div></section>
        <section class="card insight"><span class="big">💡</span><p>${esc(r.tip)}</p></section>
        ${gu ? '<button class="btn primary block" data-act="go" data-to="grownup">← Back to Grown-up mode</button>' : '<button class="btn soft block" data-act="share">📋 Copy to share with a grown-up</button>'}`;
    },
    handlers: () => ({
      share: () => { const r = G.report(); G.copy(`${S().profile.avatar} ${S().profile.nickname}'s Gullak week: got ${rs(r.income)}, spent ${rs(r.total)}, saved ${rs(r.saved)}. Stars: ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}`); }
    })
  };

  /* ---------- Badges ---------- */
  G.screens.badges = {
    render: () => {
      const have = {}; S().badges.forEach(b => { have[b.id] = b.at; });
      return `${back('🏅 My badges')}<p class="center muted">${Object.keys(have).length} of ${G.BADGES.length} collected</p>
        <div class="badge-grid">${G.BADGES.map(b => `<div class="badge ${have[b.id] ? 'got' : 'locked'}"><span>${have[b.id] ? b.e : '🔒'}</span><b>${b.n}</b><small>${b.d}</small>
          ${have[b.id] ? `<small class="muted">${G.dateStr(have[b.id])}</small>` : ''}</div>`).join('')}</div>`;
    },
    handlers: () => ({})
  };

  /* ---------- Settings ---------- */
  G.screens.settings = {
    render: () => {
      const s = S(), p = s.profile;
      return `${back('⚙️ Settings')}
        <section class="card"><h3>Me</h3>
          <div class="avatar-grid sm">${G.AVATARS.map(a => `<button class="av ${a === p.avatar ? 'on' : ''}" data-act="av" data-v="${a}">${a}</button>`).join('')}</div>
          <input class="input" id="s-nick" maxlength="14" value="${esc(p.nickname)}" aria-label="Nickname"><p class="hint">🙈 Nickname only, never your real name.</p>
          <div class="seg"><button class="seg-b ${p.ageGroup === 'junior' ? 'on' : ''}" data-act="age" data-v="junior">🧒 8–12</button><button class="seg-b ${p.ageGroup === 'senior' ? 'on' : ''}" data-act="age" data-v="senior">🧑 13–18</button></div>
          <div class="label">Pocket money</div>
          <div class="row gap"><input class="input grow" id="s-pm" type="number" inputmode="numeric" min="0" value="${p.pocketMoney}" aria-label="Pocket money">
            <div class="seg"><button class="seg-b ${p.frequency === 'weekly' ? 'on' : ''}" data-act="freq" data-v="weekly">Weekly</button><button class="seg-b ${p.frequency === 'monthly' ? 'on' : ''}" data-act="freq" data-v="monthly">Monthly</button></div></div>
          <button class="btn primary block mt" data-act="save-me">Save</button></section>
        <section class="card"><h3>App</h3>
          <label class="toggle"><input type="checkbox" id="s-sound" ${s.settings.sound ? 'checked' : ''}> 🔊 Sounds</label>
          <label class="toggle"><input type="checkbox" id="s-read" ${s.settings.readAloud ? 'checked' : ''}> 🗣️ Read things aloud for me</label>
          <div class="label">Money Lens unit</div>
          <div class="chips">${G.allUnits().map(u => `<button class="chip ${u.id === s.settings.unit ? 'on' : ''}" data-act="unit" data-v="${u.id}">${u.e} ${u.id === 'goal' ? 'my dream' : u.many}</button>`).join('')}</div></section>
        <section class="card"><h3>My data</h3><p class="small muted">Cloud diaries are encrypted before upload. Export makes a separate passphrase-protected backup.</p>
          <div class="col gap"><button class="btn soft block" data-act="export">🔐 Export encrypted backup</button>
          <label class="btn soft block file-btn">🔐 Import encrypted backup<input type="file" id="s-import" accept=".gullak,application/json,.json" hidden></label>
          <button class="btn soft block" data-act="sample">👀 Load sample data</button>
          <button class="btn danger block" data-act="reset">🗑️ Start over (delete everything)</button></div></section>
        <section class="card small muted"><h3>About Gullak</h3>
          <p>Gullak is a practice money app for kids. It uses <b>pretend amounts only</b>: no bank, UPI, card or wallet. Cloud accounts sync encrypted diary data. No ads, no real names, no photos.</p>
          <p>Made for the Dezerv Children's Day Hackathon 2026. 🐷</p></section>`;
    },
    after: (root) => {
      const snd = G.$('#s-sound', root), rd = G.$('#s-read', root), imp = G.$('#s-import', root);
      snd.addEventListener('change', () => { S().settings.sound = snd.checked; G.save(); });
      rd.addEventListener('change', () => { S().settings.readAloud = rd.checked; G.save(); if (rd.checked) G.speak('Okay! I will read things aloud for you.', true); });
      imp.addEventListener('change', () => {
        const f = imp.files[0]; if (!f) return; const fr = new FileReader();
        fr.onload = () => {
          const backupText = String(fr.result || '');
          const modal = G.modal({
            html: '<h2>🔐 Unlock encrypted backup</h2><p class="muted small">Enter the separate backup passphrase used when exporting this file.</p><input class="input" id="backup-import-pass" type="password" maxlength="256" autocomplete="off" placeholder="Backup passphrase"><button class="btn primary block mt" data-act="unlock-backup">Unlock backup</button>',
            handlers: {
              'unlock-backup': async (button) => {
                const pass = G.$('#backup-import-pass', modal.el).value;
                if (pass.length < 10) return G.toast('Enter the backup passphrase.');
                button.disabled = true; button.textContent = '🔐 Unlocking…';
                try {
                  const data = await G.cloudBackup.decode(backupText, pass);
                  if (!data.profile || !Array.isArray(data.txns)) throw new Error('This encrypted file is not an individual Gullak backup.');
                  G.S = G.normState(data); G.save(); await G.waitForCloudSync();
                  modal.close(); G.toast('📂 Encrypted backup restored!'); G.go('home');
                } catch (error) {
                  button.disabled = false; button.textContent = 'Unlock backup';
                  G.toast(error.message || 'Could not unlock this backup.');
                }
              }
            }
          });
        };
        fr.readAsText(f);
      });
    },
    handlers: () => {
      const p = S().profile;
      return {
        av: (el) => { p.avatar = el.dataset.v; G.save(); G.render({ keepScroll: true }); },
        age: (el) => { p.ageGroup = el.dataset.v; G.save(); G.render({ keepScroll: true }); },
        freq: (el) => { p.frequency = el.dataset.v; G.save(); G.render({ keepScroll: true }); },
        unit: (el) => { S().settings.unit = el.dataset.v; G.save(); G.render({ keepScroll: true }); },
        'save-me': () => {
          p.nickname = G.$('#s-nick').value.trim() || p.nickname; p.pocketMoney = Math.max(0, Math.round(Number(G.$('#s-pm').value) || 0));
          G.save(); G.toast('Saved ✅'); G.render({ keepScroll: true });
        },
        export: () => {
          const modal = G.modal({
            html: '<h2>🔐 Export encrypted backup</h2><p class="muted small">Choose a separate passphrase. You will need it to open this backup on another device.</p><label class="label">Backup passphrase</label><input class="input" id="backup-export-pass" type="password" maxlength="256" autocomplete="new-password"><label class="label">Confirm passphrase</label><input class="input" id="backup-export-confirm" type="password" maxlength="256" autocomplete="new-password"><button class="btn primary block mt" data-act="make-backup">Create encrypted file</button>',
            handlers: {
              'make-backup': async button => {
                const pass = G.$('#backup-export-pass', modal.el).value;
                const confirm = G.$('#backup-export-confirm', modal.el).value;
                if (pass.length < 10) return G.toast('Use at least 10 characters for the backup passphrase.');
                if (pass !== confirm) return G.toast('The two passphrases do not match.');
                button.disabled = true; button.textContent = '🔐 Encrypting…';
                try {
                  const text = await G.cloudBackup.encode(S(), pass);
                  G.cloudBackup.download(text); modal.close();
                  G.toast('Encrypted backup file created. Keep its passphrase safe.');
                } catch (error) {
                  button.disabled = false; button.textContent = 'Create encrypted file';
                  G.toast(error.message || 'Could not create backup.');
                }
              }
            }
          });
        },
        sample: async () => { if (await G.confirm('Load sample data?', 'This replaces your Gullak with an example one.', 'Load it', 'Cancel')) { G.act.loadSample(); G.toast('Sample loaded. Grown-up PIN is <b>1234</b>', 3500); G.go('home'); } },
        reset: async () => { if (await G.confirm('Delete everything?', 'Your Gullak will be empty. If cloud sync is active, the empty diary will replace the cloud copy too. This cannot be undone!', 'Delete all', 'Cancel')) { G.S = G.fresh(); G.parentUnlocked = false; G.save(); await G.waitForCloudSync(); localStorage.removeItem(G.storeKey); G.go('welcome'); } }
      };
    }
  };
})(window.G);
