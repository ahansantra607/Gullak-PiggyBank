/* Gullak "next level" features. Plugs into existing screens without changing how they work.
   1. 🎙️ Hey Gullak: talk or type in plain words ("I spent 40 on ice cream", "Can I buy a ₹300 toy?")
   2. 😍 Worth-It Meter: rate purchases a little later and discover your "joy per rupee"
   3. ⛅ Money Weather: a forecast of when your money runs out, plus a safe daily spend
   4. 🏦 Borrow from Future Me: a grown-up-approved pocket-money advance that repays itself on payday
   5. 👵 Then & Now: interview a grown-up about old prices and discover inflation
   6. 📖 My Money Comic: your week retold as a 4-panel comic
   7. 🧹 Effort price tags: see prices as "chores of work" in the Money Lens            */
(function (G) {
  const S = () => G.S; const esc = G.esc, rs = G.rs; const DAY = G.DAY;
  const loans = () => (S().loans = S().loans || []);
  const interviews = () => (S().interviews = S().interviews || []);
  const set = (k, d) => (S().settings[k] == null ? d : S().settings[k]);
  const back = (title, to = 'home') => `<header class="page-h"><button class="back" data-act="go" data-to="${to}" aria-label="Back">←</button><h1>${title}</h1></header>`;
  const wrap = (name, patch) => { const sc = G.screens[name]; if (sc) patch(sc); };

  /* =====================================================================
     7. Effort price tag: "₹600 = 30 chores of work"
     ===================================================================== */
  G.choreRate = (s = S()) => {
    const ch = (s.chores || []).filter(c => c.reward > 0);
    return ch.length ? Math.max(5, Math.round(ch.reduce((a, c) => a + c.reward, 0) / ch.length)) : 20;
  };
  const choreUnit = { id: 'chore', e: '🧹', one: 'chore of work', many: 'chores of work' };
  Object.defineProperty(choreUnit, 'price', { get: () => G.choreRate(), enumerable: true });
  G.UNITS.splice(G.UNITS.length - 1, 0, choreUnit); // before "% of my dream"

  /* =====================================================================
     3. Money Weather: forecast until next pocket-money day
     ===================================================================== */
  G.nextPayday = (s = S()) => {
    const p = s.profile; if (!p) return G.now() + 7 * DAY;
    const period = (p.frequency === 'monthly' ? 30 : 7) * DAY;
    let t = (s.meta.lastPayday || p.createdAt) + period;
    while (t < G.now()) t += period;
    return t;
  };
  G.burnRate = (s = S()) => { // average spend per day over the last 14 days (or since start)
    const days = G.clamp(s.profile ? (G.now() - s.profile.createdAt) / DAY : 7, 3, 14);
    const from = G.now() - days * DAY;
    return s.txns.filter(t => t.type === 'out' && t.date >= from).reduce((a, t) => a + t.amount, 0) / days;
  };
  G.weather = (s = S()) => {
    const bal = Math.max(0, G.balance(s)); const burn = G.burnRate(s);
    const until = G.nextPayday(s); const daysLeft = Math.max(1, Math.ceil((until - G.now()) / DAY));
    const predicted = Math.round(bal - burn * daysLeft);
    const safe = Math.floor(bal * 0.8 / daysLeft);
    const dayName = (ms) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'long' });
    const strip = [];
    for (let i = 1; i <= Math.min(daysLeft, 7); i++) {
      const b = bal - burn * i;
      strip.push({ d: new Date(G.now() + i * DAY).toLocaleDateString('en-IN', { weekday: 'short' }), b: Math.round(b),
        e: b <= 0 ? '⛈️' : b < bal * 0.25 ? '🌧️' : b < bal * 0.5 ? '⛅' : '☀️' });
    }
    let w;
    if (bal <= 0) w = { e: '⛈️', t: 'Stormy', msg: 'Your Gullak is empty. Time to wait for pocket money, or earn some with a chore!' };
    else if (burn < 1) w = { e: '☀️', t: 'Sunny', msg: `Clear skies! You haven't been spending, so your ${rs(bal)} is safe.` };
    else if (predicted >= bal * 0.5) w = { e: '☀️', t: 'Sunny', msg: `Sunny all the way to pocket-money day! You'll still have about ${rs(predicted)}.` };
    else if (predicted >= 0) w = { e: '⛅', t: 'Partly cloudy', msg: `A bit cloudy: you'll have about ${rs(predicted)} left by ${dayName(until)}.` };
    else {
      const runOut = G.now() + (bal / burn) * DAY;
      w = { e: '⛈️', t: 'Storm ahead', msg: `At this speed you'll run out on ${dayName(runOut)}, before pocket-money day!` };
    }
    return Object.assign(w, { bal, burn: Math.round(burn), daysLeft, predicted, safe, strip, until });
  };
  const weatherCard = () => {
    const w = G.weather();
    return `<section class="card weather w-${w.t.split(' ')[0].toLowerCase()}" >
      <div class="row gap"><span class="w-e">${w.e}</span><div class="grow"><small>Money weather</small><b>${w.t}</b>
      <small>${esc(w.msg)}</small></div>${G.speakBtn('Money weather: ' + w.t + '. ' + w.msg)}</div>
      ${w.strip.length ? `<div class="w-strip">${w.strip.map(d => `<div><small>${d.d}</small><span>${d.e}</span></div>`).join('')}</div>` : ''}
      ${w.bal > 0 ? `<div class="w-safe">🛡️ Stay sunny: spend up to <b>${rs(w.safe)} a day</b> until pocket-money day.</div>` : ''}
    </section>`;
  };

  G.screens.weather = {
    render: () => {
      const w = G.weather();
      return `${back('⛅ Money Weather')}${weatherCard()}
        <section class="card"><h3>How the forecast works</h3>
          <div class="kv"><span>🐷 Money now</span><b>${rs(w.bal)}</b></div>
          <div class="kv"><span>🔥 You usually spend</span><b>${rs(w.burn)} a day</b></div>
          <div class="kv"><span>🗓️ Days to pocket money</span><b>${w.daysLeft}</b></div>
          <div class="kv"><span>🔮 Left on pocket-money day</span><b class="${w.predicted < 0 ? 'minus' : ''}">${rs(w.predicted)}</b></div>
          <p class="small muted">Grown-ups call this a <b>budget forecast</b>. Banks and companies do it too!</p></section>
        ${w.strip.length ? `<section class="card"><h3>Day by day</h3>${w.strip.map(d => `<div class="kv"><span>${d.e} ${d.d}</span><b class="${d.b < 0 ? 'minus' : ''}">${rs(d.b)}</b></div>`).join('')}</section>` : ''}`;
    },
    handlers: () => ({})
  };

  /* =====================================================================
     2. Worth-It Meter: joy per rupee
     ===================================================================== */
  G.JOY = [{ e: '😞', n: 'Wish I hadn\'t' }, { e: '😐', n: 'Meh' }, { e: '🙂', n: 'Good' }, { e: '😍', n: 'Loved it!' }];
  const reviewMs = () => set('reviewHours', 12) * 3600e3;
  G.toReview = (s = S()) => s.txns.filter(t => t.type === 'out' && t.joy == null && t.category !== 'goal' &&
    G.now() - t.date >= reviewMs() && G.now() - t.date <= 10 * DAY).sort((a, b) => b.date - a.date);
  G.joyStats = (s = S()) => {
    const rated = s.txns.filter(t => t.type === 'out' && t.joy != null && t.joy >= 0);
    const by = {};
    rated.forEach(t => { const k = t.category; (by[k] = by[k] || { cat: k, n: 0, joy: 0, amt: 0 }); by[k].n++; by[k].joy += t.joy; by[k].amt += t.amount; });
    const rows = Object.values(by).map(r => Object.assign(r, { avg: r.joy / r.n, per100: r.amt ? r.joy / r.amt * 100 : 0 }))
      .sort((a, b) => b.per100 - a.per100);
    const regret = rated.filter(t => t.joy === 0).reduce((a, t) => a + t.amount, 0);
    const loved = rated.filter(t => t.joy === 3).reduce((a, t) => a + t.amount, 0);
    return { rated, rows, regret, loved };
  };
  const faceFor = (avg) => G.JOY[G.clamp(Math.round(avg), 0, 3)].e;
  const joyBanner = () => {
    const t = G.toReview()[0]; if (!t) return '';
    const c = G.CATS[t.category] || G.CATS.other;
    return `<div class="banner joy-b"><b>😍 Worth-It Meter:</b> ${G.dayLabel(t.date)} you spent ${rs(t.amount)} on ${c.e} ${esc(t.note || c.n)}. Was it worth it?
      <div class="faces">${G.JOY.map((j, i) => `<button class="face" data-act="joy" data-id="${t.id}" data-v="${i}" aria-label="${j.n}">${j.e}<small>${j.n}</small></button>`).join('')}</div>
      <button class="link" data-act="joy" data-id="${t.id}" data-v="-1">Skip</button></div>`;
  };
  const rateJoy = (id, v) => {
    const t = S().txns.find(x => x.id === id); if (!t) return;
    t.joy = Number(v); G.save(); G.sound(t.joy >= 2 ? 'coin' : 'pop');
    if (t.joy === 0) G.toast(`Thanks for being honest! 😞 Next time, try the Cool-down Jar for things like this.`, 3500);
    else if (t.joy === 3) G.toast('😍 Great buy! Remember what makes you happy.');
    G.after(); G.render({ keepScroll: true });
  };

  G.screens.joy = {
    render: () => {
      const st = G.joyStats(); const pend = G.toReview();
      const best = st.rows[0], worst = st.rows.length > 1 ? st.rows[st.rows.length - 1] : null;
      const cat = (k) => G.CATS[k] || G.CATS.other;
      const lesson = best && worst ? `${cat(best.cat).e} ${cat(best.cat).n} gave you the most happiness for your money. ${cat(worst.cat).e} ${cat(worst.cat).n} gave you the least. Spend more on what you 😍 and less on what you 😞. That's smart spending!` : '';
      return `${back('😍 Worth-It Meter')}
        <section class="card center joy-hero"><div class="huge">😍🙂😐😞</div>
          <p>A day after you buy something, Gullak asks: <b>was it worth it?</b> Over time you find out what <i>really</i> makes you happy.</p></section>
        ${pend.length ? `<section class="card"><h3>📝 Rate these (${pend.length})</h3>${pend.slice(0, 8).map(t => { const c = cat(t.category); return `<div class="rate-row">
            <span class="tx-e">${c.e}</span><div class="grow"><b>${esc(t.note || c.n)}</b><small>${rs(t.amount)} · ${G.dayLabel(t.date)}</small></div>
            <div class="faces sm">${G.JOY.map((j, i) => `<button class="face" data-act="joy" data-id="${t.id}" data-v="${i}" aria-label="${j.n}">${j.e}</button>`).join('')}</div></div>`; }).join('')}</section>` : ''}
        ${st.rated.length ? `<section class="card"><h3>💖 Joy per ₹100</h3>
            ${st.rows.map(r => `<div class="cat-row"><span class="cat-e">${cat(r.cat).e}</span><div class="grow"><div class="row between"><b>${cat(r.cat).n}</b><b>${faceFor(r.avg)}</b></div>
              ${G.progress(r.per100 / Math.max(...st.rows.map(x => x.per100), 0.01) * 100, 'thin joy')}<small class="muted">${G.plural(r.n, 'rating')} · ${rs(r.amt)} spent · ${r.per100.toFixed(1)} joy points per ₹100</small></div></div>`).join('')}
          </section>
          <section class="grid2">
            <div class="card center"><small>😍 Money on things you loved</small><b class="plus big2">${rs(st.loved)}</b></div>
            <div class="card center"><small>😞 Money you wish you'd kept</small><b class="minus big2">${rs(st.regret)}</b><small>${G.inUnits(st.regret, 'samosa').text} 🥟</small></div>
          </section>
          ${lesson ? `<section class="card insight"><span class="big">🧠</span><p>${esc(lesson)}</p>${G.speakBtn(lesson)}</section>` : ''}`
          : '<p class="muted center">No ratings yet. When you spend, Gullak will ask you later if it was worth it!</p>'}`;
    },
    handlers: () => ({ joy: (el) => rateJoy(el.dataset.id, el.dataset.v) })
  };

  /* =====================================================================
     4. Borrow from Future Me: an advance that teaches how loans work
     ===================================================================== */
  const owed = (l) => Math.max(0, l.total - l.paid);
  G.activeLoan = (s = S()) => (s.loans || []).find(l => l.status === 'active' || l.status === 'pending') || null;
  const loanCap = () => Math.max(100, Math.round(G.weeklyPocket() || 0));
  G.repayLoan = (amount, why) => {
    const l = (S().loans || []).find(x => x.status === 'active'); if (!l) return 0;
    const a = Math.min(Math.round(amount), owed(l), Math.max(0, G.balance())); if (a <= 0) return 0;
    const payment = G.act.addTxn({ type: 'loanPay', amount: a, loanId: l.id, note: why || 'Loan repayment' });
    if (!payment) return 0;
    l.paid += a;
    if (owed(l) <= 0) { l.status = 'repaid'; l.repaidAt = G.now(); G.confetti(); G.sound('win'); setTimeout(() => G.toast('🎉 <b>Debt-free!</b> You paid back Future You. Respect! 🦸', 4000), 400); }
    G.save(); return a;
  };
  const autoRepay = () => {
    const l = (S().loans || []).find(x => x.status === 'active'); if (!l) return;
    const a = G.repayLoan(l.installment, 'Auto pay-back on pocket-money day');
    if (a && l.status === 'active') setTimeout(() => G.toast(`🏦 ${rs(a)} went back to Future You. Still owe ${rs(owed(l))}.`, 3500), 900);
    G.after(); G.render();
  };

  G.screens.borrow = {
    render: () => {
      const l = G.activeLoan(); const rate = set('loanInterest', 0); const past = loans().filter(x => x.status === 'repaid' || x.status === 'declined');
      const intro = `<section class="card center borrow-hero"><div class="huge">🧒🏦🧑</div>
        <p><b>Borrowing = spending money from Future You.</b> You get it now, and on your next pocket-money days it goes back automatically.</p>
        ${rate ? `<p class="small">Your grown-up bank charges <b>${rate}% extra</b>. That's called <b>interest</b>: borrowing costs money!</p>` : '<p class="small muted">Your grown-up bank charges no interest right now.</p>'}</section>`;
      let body = '';
      if (l && l.status === 'pending') body = `<section class="card center"><h3>⏳ Waiting for a grown-up</h3><p>You asked to borrow <b>${rs(l.amount)}</b> for "${esc(l.reason)}".</p>
        <button class="btn soft block" data-act="go" data-to="grownup">🔒 Grown-up: decide now</button><button class="link danger" data-act="cancel-loan">Cancel</button></section>`;
      else if (l) {
        const pct = Math.round(l.paid / l.total * 100);
        body = `<section class="card"><h3>🏦 You owe Future You</h3><div class="bal">${rs(owed(l))}</div>
          ${G.progress(pct)}<div class="row between small"><span>Paid ${rs(l.paid)}</span><span>${pct}%</span><span>Total ${rs(l.total)}</span></div>
          <p class="small">📅 ${rs(l.installment)} goes back automatically on each pocket-money day (next: ${G.dateStr(G.nextPayday())}).</p>
          <p class="small muted">Borrowed ${rs(l.amount)} for "${esc(l.reason)}"${l.total > l.amount ? ` + ${rs(l.total - l.amount)} interest` : ''}.</p>
          <button class="btn primary block" data-act="payback">💪 Pay back some now</button></section>`;
      } else body = `<section class="card"><h3>➕ Ask to borrow</h3>
          <p class="small muted">You can borrow up to ${rs(loanCap())} (one week of pocket money).</p>
          ${G.keypadHTML([20, 50, 100])}
          <input class="input" id="ln-why" maxlength="40" placeholder="What is it for? e.g. Friend's birthday gift" aria-label="Reason">
          <div class="label">Pay it back over</div>
          <div class="chips">${[1, 2, 3, 4].map(n => `<button class="chip ${n === 2 ? 'on' : ''}" data-act="ln-n" data-v="${n}">${G.plural(n, 'pocket-money day')}</button>`).join('')}</div>
          <div id="ln-prev" class="preview"></div>
          <button class="btn primary block big" data-act="ask-loan" disabled>Ask a grown-up</button></section>`;
      return `${back('🏦 Borrow from Future Me')}${intro}${body}
        ${past.length ? `<section class="card"><h3>📜 Past loans</h3>${past.map(x => `<div class="kv"><span>${x.status === 'repaid' ? '✅ Paid back' : '💭 Not approved'} · ${esc(x.reason)}</span><b>${rs(x.amount)}</b></div>`).join('')}</section>` : ''}`;
    },
    after: (root) => {
      const kp = G.$('.kp', root); if (!kp) return;
      const st = G._loanForm = { amt: 0, n: 2 };
      const prev = G.$('#ln-prev', root), btn = G.$('[data-act=ask-loan]', root), why = G.$('#ln-why', root);
      const upd = () => {
        const rate = set('loanInterest', 0); const total = Math.round(st.amt * (1 + rate / 100));
        prev.innerHTML = st.amt ? `You get <b>${rs(st.amt)}</b> now. You pay back <b>${rs(total)}</b>: ${rs(Math.ceil(total / st.n))} × ${st.n}.
          <div class="delay">⏪ For the next ${G.plural(st.n, 'pocket-money day')} you'll get ${rs(Math.max(0, (S().profile.pocketMoney || 0) - Math.ceil(total / st.n)))} instead of ${rs(S().profile.pocketMoney || 0)}.</div>` : '';
        btn.disabled = !(st.amt > 0 && why.value.trim());
      };
      st.upd = upd; why.addEventListener('input', upd);
      G.attachKeypad(kp, { max: loanCap(), onChange: v => { st.amt = v; upd(); } });
    },
    handlers: () => ({
      'ln-n': (el) => { G._loanForm.n = +el.dataset.v; G.$$('[data-act=ln-n]').forEach(b => b.classList.toggle('on', b === el)); G._loanForm.upd(); },
      'ask-loan': () => {
        const f = G._loanForm; const reason = G.$('#ln-why').value.trim(); if (!f.amt || !reason) return;
        loans().push({ id: 'L' + G.uid(4), amount: f.amt, reason, n: f.n, status: 'pending', paid: 0, createdAt: G.now() });
        G.save(); G.sound('coin'); G.toast('📨 Asked! A grown-up can approve it in 🔒 Grown-up mode.'); G.render();
      },
      'cancel-loan': () => { S().loans = loans().filter(l => l.status !== 'pending'); G.save(); G.render(); },
      payback: () => {
        const l = G.activeLoan(); const max = Math.min(owed(l), Math.max(0, G.balance()));
        if (max <= 0) return G.toast('Your Gullak is empty right now.');
        let amt = 0;
        const m = G.modal({
          html: `<h2>💪 Pay back Future You</h2><p class="muted">You owe ${rs(owed(l))}. You can pay up to ${rs(max)} now.</p>${G.keypadHTML([10, 20, 50])}
            <button class="btn primary block big" data-act="ok">Pay back</button>`,
          handlers: { ok: () => { if (!amt) return; G.repayLoan(amt, 'Paid back early'); m.close(); G.after(); G.render(); } }
        });
        G.attachKeypad(m.el, { max, onChange: v => { amt = v; } });
      }
    })
  };

  /* =====================================================================
     5. Then & Now: interview a grown-up, discover inflation
     ===================================================================== */
  const TN_ITEMS = [
    { e: '🥟', n: 'samosa', now: 20 }, { e: '🎬', n: 'movie ticket', now: 250 }, { e: '🍫', n: 'chocolate bar', now: 40 },
    { e: '🚌', n: 'bus ticket', now: 20 }, { e: '🍦', n: 'ice cream cone', now: 40 }, { e: '📒', n: 'notebook', now: 50 },
    { e: '🚲', n: 'cycle', now: 6000 }, { e: '🏏', n: 'cricket bat', now: 1200 }
  ];
  // then/now are what the reporter typed; they're kept here so they survive every screen refresh
  const tn = { i: 0, who: 'Mum', years: 30, result: null, then: '', now: '' };
  const nowVal = () => (tn.now === '' ? TN_ITEMS[tn.i].now : tn.now);
  // old prices can have paise (₹2.50), so don't round them away
  const rsx = (n) => '₹' + (Number.isInteger(n) ? n.toLocaleString('en-IN') : (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const calcTN = (then, now, years) => {
    const x = now / then; const rate = Math.pow(x, 1 / years) - 1;
    return { x, rate, buysThen: Math.round(100 / x * 100) / 100, future10: Math.round(now * Math.pow(1 + rate, 10)) };
  };
  G.screens.thennow = {
    render: () => {
      const it = TN_ITEMS[tn.i]; const senior = S().profile.ageGroup === 'senior';
      const r = tn.result;
      const q = `${tn.who}, how much did a ${it.n} cost when you were my age?`;
      return `${back('👵 Then & Now', 'play')}
        <section class="card center tn-hero"><div class="huge">👵🎤🧒</div><p><b>Be a money reporter!</b> Interview a grown-up about prices when <i>they</i> were a kid. Gullak shows you a secret about money.</p></section>
        <section class="card"><div class="label">1. Pick a thing</div>
          <div class="chips">${TN_ITEMS.map((x, i) => `<button class="chip ${i === tn.i ? 'on' : ''}" data-act="tn-item" data-i="${i}">${x.e} ${x.n}</button>`).join('')}</div>
          <div class="label">2. Who are you asking?</div>
          <div class="chips">${['Mum', 'Dad', 'Nani', 'Dadi', 'Nana', 'Dada', 'Aunty', 'Uncle'].map(w => `<button class="chip ${w === tn.who ? 'on' : ''}" data-act="tn-who" data-v="${w}">${w}</button>`).join('')}</div>
          <div class="ask-q">🎤 "${esc(q)}" ${G.speakBtn(q)}</div>
          <div class="label">3. Their answer</div>
          <div class="row gap"><label class="grow"><small>Price back then (₹)</small><input class="input" id="tn-then" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 2" value="${esc(tn.then)}"></label>
            <label class="grow"><small>Price today (₹)</small><input class="input" id="tn-now" type="number" inputmode="decimal" min="0" step="any" value="${esc(nowVal())}"></label></div>
          <div class="label">How many years ago?</div>
          <div class="chips">${[15, 20, 25, 30, 35, 40, 50].map(y => `<button class="chip ${y === tn.years ? 'on' : ''}" data-act="tn-years" data-v="${y}">${y} years</button>`).join('')}</div>
          <button class="btn primary block big" data-act="tn-go">✨ Show me the secret</button></section>
        ${r ? `<section class="card center tn-result">
          <div class="tn-vs"><div><small>${esc(r.who)}'s time</small><b>${rsx(r.then)}</b></div><span>➡️</span><div><small>Today</small><b>${rsx(r.now)}</b></div></div>
          <h2>${r.e} ${r.x >= 1.05 ? `${r.x.toFixed(r.x < 10 ? 1 : 0)}× more expensive!` : 'Almost the same price!'}</h2>
          <p>Prices went up about <b>${Math.round(r.rate * 1000) / 10}% every year</b>. This is called <b>inflation</b> 🎈.</p>
          <p>Your ₹100 today buys what just <b>${rsx(r.buysThen)}</b> bought when ${esc(r.who)} was a kid.</p>
          ${senior ? `<p class="small">🔮 At this speed, a ${esc(r.n)} could cost <b>${rs(r.future10)}</b> in 10 years.</p>` : ''}
          <div class="lesson">💡 Money sitting still slowly buys less. That's why grown-ups keep savings where they <b>grow</b> (like a bank or investments), not just under the bed!</div>
        </section>` : ''}
        ${interviews().length ? `<section class="card"><h3>🗞️ My interviews</h3>${interviews().slice().reverse().map(v => `<div class="kv"><span>${v.e} ${esc(v.n)} · asked ${esc(v.who)}</span><b>${rsx(v.then)} → ${rsx(v.now)}</b></div>`).join('')}</section>` : ''}`;
    },
    after: (root) => { // remember every keystroke
      const a = G.$('#tn-then', root), b = G.$('#tn-now', root);
      a.addEventListener('input', () => { tn.then = a.value; });
      b.addEventListener('input', () => { tn.now = b.value; });
    },
    handlers: () => ({
      // a new item is a new interview: clear the old answer and use that item's usual price today
      'tn-item': (el) => { if (+el.dataset.i !== tn.i) { tn.i = +el.dataset.i; tn.then = ''; tn.now = ''; tn.result = null; } G.render({ keepScroll: true }); },
      'tn-who': (el) => { tn.who = el.dataset.v; G.render({ keepScroll: true }); },
      'tn-years': (el) => { tn.years = +el.dataset.v; G.$$('[data-act=tn-years]').forEach(b => b.classList.toggle('on', b === el)); },
      'tn-go': () => {
        const then = Number(tn.then), now = Number(nowVal());
        if (!(then > 0) || !(now > 0)) return G.toast('Type both prices first 🙂');
        const it = TN_ITEMS[tn.i]; const c = calcTN(then, now, tn.years);
        tn.result = Object.assign({ e: it.e, n: it.n, who: tn.who, then, now }, c);
        interviews().push({ e: it.e, n: it.n, who: tn.who, then, now, years: tn.years, at: G.now() });
        G.save(); G.sound('win'); G.after(); G.render({ keepScroll: true });
        setTimeout(() => { const el = G.$('.tn-result'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
      }
    })
  };

  /* =====================================================================
     6. My Money Comic: the week as a story
     ===================================================================== */
  let comicWeek = 0;
  G.comicPanels = (wk = 0, s = S()) => {
    const a = G.weekStart(G.now()) - wk * 7 * DAY, b = a + 7 * DAY;
    const inW = (t) => t >= a && t < b; const nick = s.profile.nickname; const g = G.activeGoal(s);
    const tx = s.txns.filter(t => inW(t.date)).sort((x, y) => x.date - y.date);
    const day = (ms) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'long' });
    const P = [];
    const inc = tx.find(t => t.type === 'in');
    if (inc) P.push({ cap: `${day(inc.date)}…`, art: (G.SOURCES[inc.category] || G.SOURCES.other).e + '💰', say: `Yay! ${rs(inc.amount)}${inc.note ? ' (' + inc.note + ')' : ''}!`, mood: 'happy', who: nick });
    else P.push({ cap: 'A quiet week began…', art: '🌅', say: 'No new money this week. Hmm.', mood: 'calm', who: nick });
    const outs = tx.filter(t => t.type === 'out');
    const big = outs.filter(t => t.needOrWant === 'want').sort((x, y) => y.amount - x.amount)[0] || outs.sort((x, y) => y.amount - x.amount)[0];
    if (big) { const c = G.CATS[big.category] || G.CATS.other;
      P.push({ cap: `Then, on ${day(big.date)}…`, art: c.e + '💥', say: `${big.needOrWant === 'want' ? `The ${big.note || c.n} tempted ${nick}!` : `${nick} needed ${big.note || c.n}.`} −${rs(big.amount)}${g ? `. ${g.name} pushed back ${G.plural(G.daysBack(big.amount, s), 'day')}!` : ''}`, mood: 'worried', who: 'Gullak' }); }
    const saved = tx.filter(t => t.type === 'toGoal').reduce((x, t) => x + t.amount, 0);
    const dec = (s.requests || []).find(r => r.decidedAt && inW(r.decidedAt));
    const skipped = (s.requests || []).find(r => r.status === 'dropped' && r.decidedAt && inW(r.decidedAt));
    const paid = (s.loans || []).find(l => l.repaidAt && inW(l.repaidAt));
    if (saved > 0 && g) P.push({ cap: 'But our hero fought back!', art: '🪙➡️' + g.emoji, say: `${nick} fed the ${g.name} ${rs(saved)}! Now ${G.goalPct(g, s)}% done!`, mood: 'excited', who: nick });
    if (skipped) P.push({ cap: 'A test of willpower…', art: '🧊' + skipped.emoji, say: `${nick} skipped the ${skipped.item} and kept ${rs(skipped.price)}!`, mood: 'proud', who: 'Gullak' });
    else if (dec) P.push({ cap: `${nick} asked a grown-up…`, art: dec.emoji + '🙋', say: `"Can I buy ${dec.item}?" … ${dec.status === 'approved' ? 'YES! 🎉' : dec.status === 'wait' ? 'Wait a week ⏳' : 'Not this time 💭'}`, mood: dec.status === 'approved' ? 'happy' : 'calm', who: 'Grown-up' });
    else if (paid) P.push({ cap: 'A debt was settled…', art: '🏦✅', say: `${nick} paid back Future Me!`, mood: 'proud', who: nick });
    const story = P.slice(0, 3);
    const wsum = G.spendBreakdown(wk === 0 ? 'week' : 'all', s);
    const r = wk === 0 ? G.report(s) : null;
    story.push({ cap: 'THE END… or is it? 🤔', art: '🐷', say: `${rs(G.balance(s))} left${g ? ` · ${g.name} ${G.goalPct(g, s)}%` : ''}${r ? ' · ' + '★'.repeat(r.stars) : ''}. Next week: will ${nick} ${g ? `reach ${Math.min(100, Math.ceil((G.goalPct(g, s) + 1) / 25) * 25)}%` : 'pick a dream'}?`, mood: G.mood(s).mood, who: 'Gullak', end: true });
    void wsum;
    return story;
  };
  G.screens.comic = {
    render: () => {
      const p = S().profile; const panels = G.comicPanels(comicWeek);
      const say = panels.map(x => x.cap + ' ' + x.say).join('. ');
      return `${back('📖 My Money Comic', 'play')}
        <div class="tabs"><button class="tab ${comicWeek === 0 ? 'on' : ''}" data-act="cw" data-v="0">This week</button><button class="tab ${comicWeek === 1 ? 'on' : ''}" data-act="cw" data-v="1">Last week</button></div>
        <section class="comic"><h2 class="comic-t">The Adventures of <span>Captain ${esc(p.nickname)}</span> ${esc(p.avatar)}</h2>
          <div class="panels">${panels.map((x, i) => `<div class="panel p${i}"><div class="cap">${esc(x.cap)}</div>
            <div class="art">${x.end ? G.piggy(x.mood, 90) : esc(x.art)}</div>
            <div class="say"><b>${esc(x.who)}:</b> ${esc(x.say)}</div></div>`).join('')}</div></section>
        <div class="row gap"><button class="btn soft grow" data-act="speak" data-text="${esc(say)}">🔊 Read it to me</button>
          <button class="btn soft grow" data-act="comic-copy">📋 Copy story</button></div>`;
    },
    handlers: () => ({
      cw: (el) => { comicWeek = +el.dataset.v; G.render(); },
      'comic-copy': () => G.copy(`📖 The Adventures of Captain ${S().profile.nickname}\n` + G.comicPanels(comicWeek).map((x, i) => `${i + 1}. ${x.cap} ${x.say}`).join('\n'))
    })
  };

  /* =====================================================================
     1. Hey Gullak: talk or type in plain words
     ===================================================================== */
  const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90 };
  G.parseNumber = (text) => {
    const d = text.replace(/(\d),(\d)/g, '$1$2').match(/\d+(\.\d+)?/); if (d) return Math.round(Number(d[0]));
    let total = 0, cur = 0, found = false;
    text.split(/[\s-]+/).forEach(w => {
      if (NUMW[w] != null) { cur += NUMW[w]; found = true; }
      else if (w === 'hundred' && found) cur = (cur || 1) * 100;
      else if (w === 'thousand' && found) { total += (cur || 1) * 1000; cur = 0; }
    });
    return found ? total + cur : null;
  };
  const CAT_WORDS = {
    snacks: ['ice cream', 'icecream', 'samosa', 'chips', 'chocolate', 'candy', 'pani puri', 'golgappa', 'kulfi', 'juice', 'snack', 'food', 'pizza', 'burger', 'sweet', 'cake', 'biscuit', 'momo', 'maggi', 'lunch', 'coke', 'drink'],
    games: ['game', 'coins', 'gems', 'robux', 'gaming', 'skin', 'level'],
    toys: ['toy', 'lego', 'doll', 'teddy', 'slime', 'cards', 'ball', 'car', 'robot', 'puzzle'],
    school: ['pen', 'pencil', 'notebook', 'school', 'eraser', 'project', 'stationery', 'copy', 'book', 'books', 'geometry', 'crayon'],
    gifts: ['gift', 'present', 'birthday', 'rakhi'],
    travel: ['bus', 'auto', 'metro', 'train', 'cab', 'rickshaw', 'fare'],
    clothes: ['shirt', 'shoes', 'dress', 'cap', 'clothes', 'socks', 'tshirt', 't-shirt', 'jeans'],
    fun: ['movie', 'cinema', 'park', 'ride', 'fair', 'mela', 'outing', 'zoo', 'swimming']
  };
  const NEED_CATS = ['school', 'travel'];
  const findCat = (t) => { for (const k in CAT_WORDS) if (CAT_WORDS[k].some(w => new RegExp('\\b' + w + 's?\\b').test(t))) return k; return 'other'; };
  const findThing = (t) => { for (const k in CAT_WORDS) { const w = CAT_WORDS[k].find(w => new RegExp('\\b' + w + 's?\\b').test(t)); if (w) return w; } return ''; };
  const findSource = (t) => /nani|nana|dadi|dada|aunty|auntie|uncle|gift|birthday|diwali|grand/.test(t) ? 'gift'
    : /earn|chore|work|help|wash|clean|sold|job/.test(t) ? 'earned' : /pocket|allowance/.test(t) ? 'pocket' : 'other';
  const itemFrom = (t) => {
    const m = t.match(/(?:buy|get|afford|have)\s+(?:a|an|the|some|new)?\s*(.+)/); let s = m ? m[1] : '';
    s = s.replace(/\d+|₹|rs\.?|rupees?|for|of|worth|costing|that costs|please|mum|mom|dad|papa|mummy|\?|!|\.|,/g, ' ')
      .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return s.split(' ').slice(0, 4).join(' ');
  };

  G.chat = G.chat || [];
  const acts = []; // pending action buttons inside chat
  const say = (html, plain, voice) => { G.chat.push({ from: 'pig', html }); if (voice || S().settings.readAloud) G.speak(plain || html, true); };
  const me = (text) => G.chat.push({ from: 'me', html: esc(text) });
  const actBtn = (label, fn, cls = 'soft') => { acts.push(fn); return `<button class="btn small ${cls}" data-act="chat-do" data-i="${acts.length - 1}">${label}</button>`; };

  G.answer = (raw, voice) => {
    const t = ' ' + raw.toLowerCase().replace(/₹/g, ' ').replace(/\brs\.?/g, ' ').replace(/\s+/g, ' ') + ' ';
    const n = G.parseNumber(t); const g = G.activeGoal(); const bal = G.balance();
    S().meta.talked = (S().meta.talked || 0) + 1;
    // greetings
    if (/\b(hi|hello|hey|namaste|hii)\b/.test(t) && n == null && t.trim().split(' ').length <= 4) {
      const m = `Oink oink, ${S().profile.nickname}! 🐷 Tell me what you spent or got, or ask me "Can I buy…?"`;
      return say(m, m, voice);
    }
    // can I buy / afford
    if (/\b(can|could|should|may)\s+i\s+(buy|get|afford|have)\b|\bafford\b/.test(t)) {
      if (n == null) return say('How much does it cost? Try: <i>"Can I buy a ₹300 toy?"</i>', 'How much does it cost?', voice);
      const item = itemFrom(t) || 'it';
      const days = g ? G.daysBack(n) : 0; const chores = G.inUnits(n, 'chore').text; const sam = G.inUnits(n, 'samosa').text;
      let html, plain;
      if (n <= bal) {
        const w = G.weather(); const after = Math.max(0, bal - n);
        html = `You have <b>${rs(bal)}</b>, so yes, you <i>could</i> buy ${esc(item)} for ${rs(n)}. But think first:
          <ul><li>🥟 That's <b>${sam}</b></li><li>🧹 That's <b>${chores}</b></li>${g ? `<li>⏪ Your ${esc(g.name)} moves back <b>${G.plural(days, 'day')}</b></li>` : ''}
          <li>🐷 You'd have ${rs(after)} left${w.burn ? ` (enough for about ${G.plural(Math.floor(after / Math.max(1, w.burn)), 'day')})` : ''}</li></ul>Is it a need or a want? 🤔`;
        plain = `You could. It's ${sam}, ${chores}${g ? `, and your ${g.name} moves back ${days} days` : ''}. Is it a need or a want?`;
      } else {
        const short = n - Math.max(0, bal); const d = Math.ceil(short / G.dailySaving());
        html = `Not yet! You have ${rs(Math.max(0, bal))}, so you're <b>${rs(short)} short</b>. Saving at your speed, that's about <b>${G.plural(d, 'day')}</b>. Or ask a grown-up for a half deal 🤝.`;
        plain = `Not yet. You're ${short} rupees short. That's about ${d} days of saving.`;
      }
      html += `<div class="row gap mt">${actBtn('🙋 Ask a grown-up', () => { G.askPrefill = { price: n, item: item === 'it' ? '' : item }; G.go('ask'); }, 'primary')}
        ${actBtn('🧊 Cool it first', () => {
          S().requests.unshift({ id: 'R' + G.uid(4), item: item === 'it' ? 'Something' : item, emoji: '🎁', price: n, needOrWant: 'want', reasons: [], kidPays: n, status: 'cooling', coolUntil: G.now() + set('coolHours', 24) * 3600e3, createdAt: G.now() });
          G.save(); say(`🧊 Put ${esc(item)} in the Cool-down Jar. I'll remind you later!`, 'Done. I put it in the cool down jar.', voice); G.render();
        })}</div>`;
      return say(html, plain, voice);
    }
    // how much did I spend on X
    if (/how much.*(spen[dt]|spend)|what.*(spen[dt])/.test(t)) {
      const per = /month/.test(t) ? 'month' : /all|ever|total/.test(t) ? 'all' : 'week';
      const c = findCat(t); const b = G.spendBreakdown(per);
      const when = per === 'week' ? 'this week' : per === 'month' ? 'this month' : 'so far';
      if (c !== 'other' && /\bon\b|\bfor\b/.test(t)) {
        const row = b.rows.find(r => r.cat === c); const a = row ? row.amount : 0;
        const m = `You spent <b>${rs(a)}</b> on ${G.CATS[c].e} ${G.CATS[c].n.toLowerCase()} ${when}${a ? ` = ${G.inUnits(a, 'samosa').text} 🥟` : '. Nice! 🌟'}`;
        return say(m, m, voice);
      }
      const m = `You spent <b>${rs(b.total)}</b> ${when}. ${b.rows[0] ? `Most went on ${G.CATS[b.rows[0].cat].e} ${G.CATS[b.rows[0].cat].n.toLowerCase()}.` : ''} ${actBtn('💸 Show me', () => G.go('money'))}`;
      return say(m, `You spent ${b.total} rupees ${when}.`, voice);
    }
    // when will I get my dream
    if (/\b(when|how long|how many days)\b.*\b(get|buy|reach|have|dream|goal)\b|\bmy (dream|goal)\b/.test(t)) {
      if (!g) return say(`You haven't picked a dream yet! ${actBtn('🌈 Pick one', () => G.go('goal'), 'primary')}`, 'Pick a dream first!', voice);
      const d = G.daysToGoal(g);
      const m = d ? `Your ${esc(g.name)} ${g.emoji} is <b>${G.goalPct(g)}%</b> done. At your speed you'll get it in <b>${G.plural(d, 'day')}</b>, around ${new Date(G.now() + d * DAY).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. Skip one samosa a day to get there faster! 🥟`
        : `Your ${esc(g.name)} money is ready! 🎉`;
      return say(m, m, voice);
    }
    // spent money
    if (/\b(spent|spend|bought|buy|paid|pay|wasted)\b/.test(t) && n != null) {
      const cat = findCat(t); const nw = NEED_CATS.includes(cat) ? 'need' : 'want'; const thing = findThing(t);
      const c = G.CATS[cat];
      const m = `Got it! Shall I write <b>${rs(n)}</b> on ${c.e} <b>${esc(thing || c.n)}</b> (${nw === 'need' ? '🧩 need' : '✨ want'})?${g ? `<br><small>⏪ It pushes your ${esc(g.name)} back ${G.plural(G.daysBack(n), 'day')}.</small>` : ''}
        <div class="row gap mt">${actBtn('✅ Yes, save it', () => {
          const tx = G.act.addTxn({ type: 'out', amount: n, category: cat, needOrWant: nw, note: thing ? thing.replace(/^\w/, x => x.toUpperCase()) : '' });
          if (!tx) return say(`You only have ${rs(Math.max(0, G.balance()))} available, so I haven't recorded that spend.`, `You only have ${Math.max(0, G.balance())} rupees available.`, voice);
          G.sound('pop'); say(`📝 Written! You have ${rs(G.balance())} left.`, `Written. You have ${G.balance()} rupees left.`, voice); G.after(); G.render();
        }, 'primary')}${actBtn('✏️ Change', () => G.openTxn('out', { amount: n, cat, nw }))}</div>`;
      return say(m, `Shall I write ${n} rupees on ${thing || c.n}?`, voice);
    }
    // got money
    if (/\b(got|get|received|earned|earn|gave me|given|pocket money|allowance|found)\b/.test(t) && n != null) {
      const src = findSource(t); const sc = G.SOURCES[src];
      const m = `Yay! Shall I add <b>${rs(n)}</b> from ${sc.e} ${sc.n}?<div class="row gap mt">${actBtn('✅ Yes, add it', () => {
          G.act.addTxn({ type: 'in', amount: n, category: src, note: src === 'gift' && /nani|nana|dadi|dada|aunty|uncle/.test(t) ? 'Gift from ' + t.match(/nani|nana|dadi|dada|aunty|uncle/)[0].replace(/^\w/, x => x.toUpperCase()) : '' });
          G.sound('coin'); say(`💰 Added! You have ${rs(G.balance())} now.`, `Added. You have ${G.balance()} rupees now.`, voice); G.after(); G.render();
          if (G.activeGoal()) setTimeout(() => G.saveNudge(n), 400);
        }, 'primary')}</div>`;
      return say(m, `Shall I add ${n} rupees?`, voice);
    }
    // save to dream
    if (/\b(save|put|keep|feed|move)\b/.test(t) && n != null) {
      if (!g) return say('Pick a dream first! 🌈', 'Pick a dream first', voice);
      if (n > bal) return say(`You only have ${rs(Math.max(0, bal))} to move.`, `You only have ${bal} rupees.`, voice);
      const m = `Move <b>${rs(n)}</b> into your ${esc(g.name)} ${g.emoji}? That's ${G.plural(G.daysBack(n), 'day')} closer!<div class="row gap mt">${actBtn('🪙 Yes!', () => {
          const bonus = G.act.saveToGoal(g.id, n); G.sound('coin');
          say(`🪙 Done! ${esc(g.name)} is now ${G.goalPct(g)}%${bonus ? ` (+${rs(bonus)} grown-up match!)` : ''}.`, `Done. ${g.name} is now ${G.goalPct(g)} percent.`, voice); G.after(); G.render();
        }, 'primary')}</div>`;
      return say(m, `Move ${n} rupees into your ${g.name}?`, voice);
    }
    // weather
    if (/weather|forecast|run out|last till|last until|enough/.test(t)) {
      const w = G.weather(); const m = `${w.e} <b>${w.t}.</b> ${esc(w.msg)}${w.bal > 0 ? ` Spend up to ${rs(w.safe)} a day to stay sunny.` : ''}`;
      return say(m, `${w.t}. ${w.msg}`, voice);
    }
    // balance
    if (/how much (money )?(do i|have i)|balance|money do i have|how much.*(left|have)|my money/.test(t)) {
      const u = G.inUnits(bal, 'samosa'); const m = `You have <b>${rs(bal)}</b> to spend = ${u.text} 🥟${G.totalInGoals() ? `, plus ${rs(G.totalInGoals())} safe in your dream jar` : ''}.`;
      return say(m, m, voice);
    }
    if (/joke/.test(t)) { const j = ['Why did the piggy bank go to school? To get a little <i>cents</i>! 🐷', 'What do you call a sleeping piggy bank? A <i>snore</i>-ings account! 😴', 'Why is money called dough? Because we all knead it! 🍞'][Math.floor(Math.random() * 3)]; return say(j, j, voice); }
    if (/tip|advice|help|idea|how do i save|teach/.test(t)) {
      const tips = ['Save first, spend later: feed your dream on pocket-money day. 🪙', 'Before buying, ask: need or want? Would I still want it next week? 🤔', 'Rate your buys in the Worth-It Meter to learn what really makes you happy. 😍', 'Do a chore for a grown-up and earn extra! 🧹'];
      const tip = tips[Math.floor(Math.random() * tips.length)]; return say(tip, tip, voice);
    }
    return say(`Hmm, I didn't get that 🙈. Try:<div class="chips">${['I spent 40 on ice cream', 'Can I buy a ₹300 toy?', 'When will I get my dream?', 'How much do I have?'].map(x => `<button class="chip" data-act="chat-say" data-t="${esc(x)}">${esc(x)}</button>`).join('')}</div>`, 'Hmm, I did not get that. Try saying, I spent 40 on ice cream.', voice);
  };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  const send = (text, voice) => { text = String(text || '').trim(); if (!text) return; me(text); G.answer(text, voice); G.after(); G.render({ keepScroll: true }); scrollChat(); };
  const scrollChat = () => setTimeout(() => { const c = G.$('.chat'); if (c) c.scrollTop = c.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }, 30);

  G.screens.talk = {
    render: () => {
      if (!G.chat.length) G.chat.push({ from: 'pig', html: `Hi ${esc(S().profile.nickname)}! I'm Gullak 🐷. ${SR ? 'Tap 🎙️ and <b>talk</b> to me' : 'Type to me'} like a friend. I can write down spends, add money, and tell you if you can afford things!` });
      const sugg = ['I spent 40 on ice cream', 'Nani gave me 200', 'Can I buy a ₹300 toy?', 'When will I get my dream?', 'How much did I spend on snacks?', 'What\'s my money weather?', 'Save 50', 'Tell me a joke'];
      return `${back('🎙️ Hey Gullak')}
        <section class="chat-wrap"><div class="chat">${G.chat.map(m => `<div class="msg ${m.from}">${m.from === 'pig' ? `<span class="pig-ava">${G.piggy('happy', 40)}</span>` : ''}<div class="msg-b">${m.html}</div></div>`).join('')}</div></section>
        <div class="chips sugg">${sugg.map(x => `<button class="chip" data-act="chat-say" data-t="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <div class="chat-bar">${SR ? `<button class="mic ${listening ? 'on' : ''}" data-act="mic" aria-label="Talk">🎙️</button>` : ''}
          <input class="input grow" id="chat-in" maxlength="120" placeholder="${SR ? 'Talk or type…' : 'Type here…'}" aria-label="Message" autocomplete="off">
          <button class="btn primary" data-act="chat-send" aria-label="Send">➤</button></div>
        ${SR ? '' : '<p class="fine">🎙️ Voice works in Chrome and Edge. You can always type!</p>'}`;
    },
    after: (root) => {
      const inp = G.$('#chat-in', root);
      if (!inp) return;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(inp.value); } });
      inp.focus()
      scrollChat();
    },
    handlers: () => ({
      'chat-send': () => send(G.$('#chat-in').value),
      'chat-say': (el) => send(el.dataset.t),
      'chat-do': (el) => {
        const i = +el.dataset.i; const fn = acts[i]; if (!fn) return;
        acts[i] = null; // each button works once; remove its button row from the chat history
        G.chat.forEach(m => { if (m.html.includes(`data-i="${i}"`)) m.html = m.html.replace(/<div class="row gap mt">[\s\S]*?<\/div>/, '<div class="small muted mt">✔️ Done</div>'); });
        fn(); G.render({ keepScroll: true }); scrollChat();
      },
      mic: () => {
        if (!SR) return;
        if (listening && rec) { rec.stop(); return; }
        rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
        rec.onresult = (e) => { const r = e.results[e.results.length - 1]; const inp = G.$('#chat-in'); if (inp) inp.value = r[0].transcript; if (r.isFinal) { listening = false; send(r[0].transcript, true); } };
        rec.onerror = (e) => { listening = false; G.toast(e.error === 'not-allowed' ? '🎙️ Please allow the microphone to talk to me.' : '🎙️ I couldn\'t hear you. Try again or type!'); G.render({ keepScroll: true }); };
        rec.onend = () => { if (listening) { listening = false; G.render({ keepScroll: true }); } };
        listening = true; G.sound('pop'); rec.start(); G.render({ keepScroll: true });
      }
    })
  };

  /* =====================================================================
     Badges for the new features
     ===================================================================== */
  G.BADGES.push(
    { id: 'talker', e: '🎙️', n: 'Chatterbox', d: 'Talked to Gullak', t: s => (s.meta.talked || 0) > 0 },
    { id: 'joy5', e: '😍', n: 'Joy Detective', d: 'Rated 5 buys in the Worth-It Meter', t: s => s.txns.filter(t => t.joy != null && t.joy >= 0).length >= 5 },
    { id: 'debtfree', e: '🦸', n: 'Debt-Free Hero', d: 'Paid back a loan from Future Me', t: s => (s.loans || []).some(l => l.status === 'repaid') },
    { id: 'reporter', e: '🗞️', n: 'Money Reporter', d: 'Interviewed a grown-up in Then & Now', t: s => (s.interviews || []).length > 0 },
    { id: 'sunny', e: '☀️', n: 'Sunny Saver', d: 'Money weather is sunny with ₹100+', t: s => !!s.profile && G.weather(s).t === 'Sunny' && G.balance(s) >= 100 }
  );

  /* =====================================================================
     Plug into existing screens (wrapping, never replacing)
     ===================================================================== */
  wrap('home', (sc) => {
    const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => {
      let html = r0(q);
      const l = G.activeLoan();
      const loanB = l && l.status === 'active' ? `<div class="banner info">🏦 You owe Future You <b>${rs(owed(l))}</b>. ${rs(l.installment)} goes back next pocket-money day. <button class="link" data-act="go" data-to="borrow">See</button></div>` : '';
      html = html.replace('<section class="pig-card">', joyBanner() + loanB + '<section class="pig-card">');
      html = html.replace('<section class="balance card">', `<button class="talk-bar" data-act="go" data-to="talk"><span class="mic sm">🎙️</span><span class="grow"><b>Hey Gullak…</b><small>Talk or type: "I spent 40 on ice cream"</small></span><span class="chev">›</span></button>
        <section class="balance card">`);
      html = html.replace('<h3 class="section-t">Your 3 big questions</h3>', `<button class="w-mini" data-act="go" data-to="weather">${(() => { const w = G.weather(); return `<span>${w.e}</span><span class="grow"><b>Money weather: ${w.t}</b><small>${esc(w.msg)}</small></span><span class="chev">›</span>`; })()}</button>
        <h3 class="section-t">Your 3 big questions</h3>`);
      html = html.replace('<button class="tile" data-act="go" data-to="settings">', `<button class="tile" data-act="go" data-to="joy"><span>😍</span>Worth it?${G.toReview().length ? ` <i class="dot">${G.toReview().length}</i>` : ''}</button>
        <button class="tile" data-act="go" data-to="borrow"><span>🏦</span>Borrow</button>
        <button class="tile" data-act="go" data-to="comic"><span>📖</span>My comic</button>
        <button class="tile" data-act="go" data-to="thennow"><span>👵</span>Then & Now</button>
        <button class="tile" data-act="go" data-to="talk"><span>🎙️</span>Talk</button>
        <button class="tile" data-act="go" data-to="settings">`);
      return html;
    };
    sc.handlers = (q) => {
      const h = h0(q); const pay0 = h.payday;
      return Object.assign(h, {
        joy: (el) => rateJoy(el.dataset.id, el.dataset.v),
        payday: (el) => { pay0(el); autoRepay(); }
      });
    };
  });

  wrap('play', (sc) => {
    const r0 = sc.render;
    sc.render = (q) => r0(q) + `
      <button class="game-card comicg" data-act="go" data-to="comic"><span>📖</span><div><b>My Money Comic</b><small>Your week, told as a superhero comic.</small></div></button>
      <button class="game-card tng" data-act="go" data-to="thennow"><span>👵</span><div><b>Then & Now</b><small>Interview a grown-up about old prices. Discover inflation!</small></div></button>
      <button class="game-card joyg" data-act="go" data-to="joy"><span>😍</span><div><b>Worth-It Meter</b><small>Find out what really makes you happy per rupee.</small></div></button>
      <button class="game-card talkg" data-act="go" data-to="talk"><span>🎙️</span><div><b>Hey Gullak</b><small>Talk to your piggy bank like a friend.</small></div></button>`;
  });

  wrap('money', (sc) => {
    const r0 = sc.render;
    sc.render = (q) => r0(q).replace('<section class="card lens-card">', () => {
      const st = G.joyStats(); const best = st.rows[0];
      return (st.rated.length && best ? `<button class="w-mini joy-mini" data-act="go" data-to="joy"><span>😍</span><span class="grow"><b>Best joy per rupee: ${(G.CATS[best.cat] || G.CATS.other).e} ${(G.CATS[best.cat] || G.CATS.other).n}</b><small>${st.regret ? `${rs(st.regret)} spent on things you regret` : 'No regrets so far!'}</small></span><span class="chev">›</span></button>` : '') + '<section class="card lens-card">';
    });
  });

  wrap('grownup', (sc) => {
    const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => {
      let html = r0(q);
      if (!G.parentUnlocked) return html;
      const p = loans().find(l => l.status === 'pending'); const a = loans().find(l => l.status === 'active');
      const rate = set('loanInterest', 0);
      const sec = `<section class="card"><h3>🏦 Borrow from Future Me</h3>
        ${p ? `<div class="req-p"><b>${esc(S().profile.nickname)} wants to borrow ${rs(p.amount)}</b><br><small>For: "${esc(p.reason)}" · pay back over ${G.plural(p.n, 'pocket-money day')}</small>
          <p class="small">With ${rate}% interest they repay ${rs(Math.round(p.amount * (1 + rate / 100)))} (${rs(Math.ceil(Math.round(p.amount * (1 + rate / 100)) / p.n))} per payday, taken automatically).</p>
          <div class="dec-grid"><button class="btn dec approved" data-act="loan-yes">✅ Approve</button><button class="btn dec declined" data-act="loan-no">💭 Not now</button></div></div>`
          : a ? `<p>Active loan: owes <b>${rs(owed(a))}</b> of ${rs(a.total)}.</p>` : '<p class="muted small">No loan requests.</p>'}
        <div class="label">Interest on loans (teaches that borrowing costs)</div>
        <div class="chips">${[0, 5, 10, 20].map(v => `<button class="chip ${rate === v ? 'on' : ''}" data-act="loan-rate" data-v="${v}">${v ? v + '%' : 'None'}</button>`).join('')}</div></section>`;
      html = html.replace('<section class="card"><h3>⚙️ Grown-up settings</h3>', sec + '<section class="card"><h3>⚙️ Grown-up settings</h3>');
      const rh = set('reviewHours', 12);
      html = html.replace('<div class="row gap mt"><button class="btn soft grow" data-act="newpin">', `<div class="label">😍 Ask "Was it worth it?" after</div>
        <div class="chips">${[[1 / 60, '1 min (demo)'], [3, '3 hours'], [12, '12 hours'], [24, '1 day']].map(([v, n]) => `<button class="chip ${Math.abs(rh - v) < 1e-6 ? 'on' : ''}" data-act="review-h" data-v="${v}">${n}</button>`).join('')}</div>
        <div class="row gap mt"><button class="btn soft grow" data-act="newpin">`);
      return html;
    };
    sc.handlers = (q) => Object.assign(h0(q), {
      'loan-yes': () => {
        const p = loans().find(l => l.status === 'pending'); if (!p) return;
        const rate = set('loanInterest', 0); p.interestPct = rate; p.total = Math.round(p.amount * (1 + rate / 100)); p.installment = Math.ceil(p.total / p.n);
        p.status = 'active'; p.approvedAt = G.now();
        G.act.addTxn({ type: 'loanIn', amount: p.amount, loanId: p.id, note: 'Advance: ' + p.reason });
        G.sound('coin'); G.toast(`✅ Loan approved: ${rs(p.amount)}`); G.after(); G.render({ keepScroll: true });
      },
      'loan-no': () => { const p = loans().find(l => l.status === 'pending'); if (p) { p.status = 'declined'; G.save(); G.render({ keepScroll: true }); } },
      'loan-rate': (el) => { S().settings.loanInterest = +el.dataset.v; G.save(); G.render({ keepScroll: true }); },
      'review-h': (el) => { S().settings.reviewHours = +el.dataset.v; G.save(); G.render({ keepScroll: true }); }
    });
  });

  /* richer sample data for the new features */
  const ls0 = G.act.loadSample;
  G.act.loadSample = () => {
    ls0(); const s = S(); const t0 = G.now(); const d = (n) => t0 - n * DAY;
    const outs = s.txns.filter(t => t.type === 'out' && t.category !== 'asked').sort((a, b) => a.date - b.date);
    const faces = { Notebook: 3, 'Game coins': 0, 'Ice cream': 2, Samosa: 1, 'Auto to tuition': 2, "Friend's gift": 3, Chips: 0 };
    outs.forEach(t => { if (faces[t.note] != null && t.date < d(1)) t.joy = faces[t.note]; });
    s.loans = [{ id: 'LA1B2', amount: 100, reason: 'Rakhi gift for my sister', n: 2, status: 'repaid', paid: 100, total: 100, installment: 50, interestPct: 0, createdAt: d(16), approvedAt: d(16), repaidAt: d(3) }];
    s.txns.push({ id: G.uid(8), type: 'loanIn', amount: 100, loanId: 'LA1B2', note: 'Advance', date: d(16) },
      { id: G.uid(8), type: 'loanPay', amount: 50, loanId: 'LA1B2', note: 'Auto pay-back', date: d(10) + 1800e3 },
      { id: G.uid(8), type: 'loanPay', amount: 50, loanId: 'LA1B2', note: 'Auto pay-back', date: d(3) + 1800e3 });
    s.interviews = [{ e: '🥟', n: 'samosa', who: 'Mum', then: 2, now: 20, years: 30, at: d(4) }];
    s.settings.reviewHours = 12;
    G.checkBadges(s); G.save();
  };
})(window.G);
