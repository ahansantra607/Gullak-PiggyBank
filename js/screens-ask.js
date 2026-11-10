/* Gullak Q3 "Can I buy this, Mum?": asks, Cool-down Jar, grown-up mode, share links, chores. */
(function (G) {
  const S = () => G.S; const esc = G.esc, rs = G.rs;
  G.screens = G.screens || {};
  const DECISIONS = {
    approved: { e: '✅', n: 'Yes!', code: 'YES' },
    half: { e: '🤝', n: 'Yes, if you pay half', code: 'HALF' },
    wait: { e: '⏳', n: 'Wait a week', code: 'WAIT' },
    declined: { e: '💭', n: 'Not this time', code: 'NO' }
  };
  const CODE_TO = { YES: 'approved', HALF: 'half', WAIT: 'wait', NO: 'declined' };

  /* Decision buttons with real amounts, so grown-ups know exactly what each one means.
     "Yes" accepts the kid's own offer. "Half" is a counter-offer, shown only when the kid offered less than half. */
  G.decKeys = (price, kidPays) => ['approved'].concat(kidPays < Math.round(price / 2) ? ['half'] : [], ['wait', 'declined']);
  G.decLabel = (k, price, kidPays) => {
    const you = Math.max(0, price - kidPays), half = Math.round(price / 2);
    if (k === 'approved') return kidPays >= price ? `✅ Yes<small>they pay all ${rs(price)}</small>`
      : kidPays <= 0 ? `✅ Yes<small>I'll pay all ${rs(price)}</small>` : `✅ Yes, deal!<small>they pay ${rs(kidPays)} · I pay ${rs(you)}</small>`;
    if (k === 'half') return `🤝 Only if they pay half<small>they pay ${rs(half)} · I pay ${rs(price - half)}</small>`;
    if (k === 'wait') return '⏳ Wait a week<small>ask again in 7 days</small>';
    return '💭 Not this time<small>no money moves</small>';
  };
  G.decButtons = (price, kidPays, attrs) => `<div class="dec-grid">${G.decKeys(price, kidPays).map(k =>
    `<button class="btn dec ${k}" ${attrs(k)}>${G.decLabel(k, price, kidPays)}</button>`).join('')}</div>`;

  /* impact of a request on the kid's money and dream */
  G.impact = (price, kidPays, s = S()) => {
    const g = G.activeGoal(s); const bal = G.balance(s);
    return { bal, after: bal - kidPays, units: G.inUnits(kidPays, s.settings.unit === 'goal' ? 'samosa' : s.settings.unit, s),
      goal: g ? { name: g.name, emoji: g.emoji, target: g.target, saved: G.goalSaved(g.id, s), pct: G.goalPct(g, s) } : null,
      daysBack: g ? G.daysBack(kidPays, s) : 0, parentPays: Math.max(0, price - kidPays) };
  };
  const impactHTML = (r, im) => `<div class="impact">
      <div class="kv"><span>🐷 ${r.nick === 'You' ? 'You have' : esc(r.nick || 'Kid') + ' has'}</span><b>${rs(im.bal)}</b></div>
      <div class="kv"><span>🧒 ${r.nick === 'You' ? 'You pay' : esc(r.nick || 'Kid') + ' pays'}</span><b>${rs(r.kidPays)}</b></div>
      <div class="kv"><span>🧑 Grown-up pays</span><b>${rs(Math.max(0, r.price - r.kidPays))}</b></div>
      <div class="kv"><span>💰 Left after</span><b class="${im.after < 0 ? 'minus' : ''}">${rs(im.after)}</b></div>
      ${im.goal ? `<div class="delay">⏪ ${im.goal.emoji} ${esc(im.goal.name)} moves back <b>${G.plural(im.daysBack, 'day')}</b></div>` : ''}
    </div>`;

  /* payload for the grown-up link: no personal info, just the made-up request */
  const linkFor = (r) => {
    const s = S(); const im = G.impact(r.price, r.kidPays);
    const d = { v: 1, id: r.id, item: r.item, e: r.emoji, p: r.price, nw: r.needOrWant, rs: r.reasons, why: r.why || '', k: r.kidPays,
      nick: s.profile.nickname, av: s.profile.avatar, bal: im.bal, g: im.goal, db: im.daysBack };
    return G.appBase() + '#/parent?r=' + G.b64e(d);
  };
  G.linkFor = linkFor;
  G.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); G.toast('📋 Copied!'); }
    catch (e) { window.prompt('Copy this:', text); }
  };
  G.whatsapp = (text) => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');

  G.openShare = (r) => {
    const link = linkFor(r);
    const msg = `${S().profile.avatar} ${S().profile.nickname} is asking on Gullak: "Can I buy ${r.emoji} ${r.item} for ${rs(r.price)}?" I'll pay ${rs(r.kidPays)}. Tap to answer: ${link}`;
    const m = G.modal({
      topBtn: { act: 'later', label: '⏰ Later' },
      html: `<h2>📨 Who will answer?</h2><p class="muted">Show your grown-up the request. They can answer on this phone or their own.</p>
        <div class="col gap">
          <button class="btn primary block big" data-act="here">🧑 Grown-up is here (this phone)</button>
          <button class="btn wa block big" data-act="wa">📲 Send on WhatsApp</button>
          <button class="btn soft block" data-act="copy">📋 Copy link</button>
        </div>
        <p class="fine">The link only has your nickname and the request. No real names or numbers.</p>`,
      handlers: {
        here: () => { m.close(); G.go('grownup'); },
        wa: () => { G.whatsapp(msg); m.close(); G.toast('When they answer, tap their reply link or type the code on the Ask screen.', 4500); },
        copy: () => G.copy(link),
        later: () => { m.close(); G.toast('⏰ Saved! Your ask is waiting. A grown-up can decide any time in 🔒 Grown-up mode, or tap 📨 on the Ask screen to send it.', 4500); }
      }
    });
  };

  /* ---------- the "Can I buy this?" form ---------- */
  G.openAsk = (pre = {}) => {
    const st = { e: pre.emoji || '🎮', price: pre.price || 0, nw: null, reasons: new Set(), pct: 50 };
    let upd = () => {};
    const m = G.modal({
      html: `<h2>🙋 Can I buy this?</h2>
        <div class="emoji-row">${G.EMOJI_PICK.map(e => `<button class="emo ${e === st.e ? 'on' : ''}" data-act="emo" data-v="${e}">${e}</button>`).join('')}</div>
        <input class="input" id="a-item" maxlength="26" placeholder="What do you want? e.g. Comic book" value="${esc(pre.item || '')}" aria-label="Item">
        <div class="label">It costs</div>${G.keypadHTML([50, 100, 200, 500])}
        <div class="label">Is it a…</div>
        <div class="seg"><button class="seg-b" data-act="nw" data-v="need">🧩 Need</button><button class="seg-b" data-act="nw" data-v="want">✨ Want</button></div>
        <div class="label">Why should we buy it? (pick any)</div>
        <div class="chips">${G.REASONS.map((r, i) => `<button class="chip" data-act="reason" data-i="${i}">${esc(r)}</button>`).join('')}</div>
        <input class="input" id="a-why" maxlength="60" placeholder="Or say it your way (optional)" aria-label="Your reason">
        <div class="label">🤝 I'll pay <b id="a-pay">${st.pct}%</b> <small class="muted" id="a-pay-rs"></small></div>
        <input type="range" id="a-pct" min="0" max="100" step="10" value="${st.pct}" class="range" aria-label="How much you will pay">
        <div id="a-impact"></div>
        <div id="a-cool"></div>
        <button class="btn primary block big" data-act="send" disabled>Ask a grown-up</button>`,
      handlers: {
        emo: (el) => { st.e = el.dataset.v; G.$$('.emo', m.el).forEach(b => b.classList.toggle('on', b === el)); },
        nw: (el) => { st.nw = el.dataset.v; G.$$('.seg-b', m.el).forEach(b => b.classList.toggle('on', b === el)); upd(); },
        reason: (el) => { const i = +el.dataset.i; st.reasons.has(i) ? st.reasons.delete(i) : st.reasons.add(i); el.classList.toggle('on'); },
        send: () => create('pending'),
        cool: () => create('cooling')
      }
    });
    const create = (status) => {
      const item = G.$('#a-item', m.el).value.trim(); if (!item || !st.price || !st.nw) return;
      const kidPays = Math.round(st.price * st.pct / 100);
      const r = { id: 'R' + G.uid(4), item, emoji: st.e, price: st.price, needOrWant: st.nw,
        reasons: Array.from(st.reasons).map(i => G.REASONS[i]), why: G.$('#a-why', m.el).value.trim(), kidPays, status, createdAt: G.now() };
      if (status === 'cooling') r.coolUntil = G.now() + S().settings.coolHours * 3600e3;
      S().requests.unshift(r); G.save(); m.close(); G.after(); G.render();
      if (status === 'cooling') { G.sound('pop'); G.toast(`🧊 ${esc(item)} is chilling in the Cool-down Jar. Smart move!`, 3500); }
      else { G.sound('coin'); G.openShare(r); }
    };
    const itemEl = G.$('#a-item', m.el), pctEl = G.$('#a-pct', m.el), btn = G.$('[data-act=send]', m.el);
    upd = () => {
      const kidPays = Math.round(st.price * st.pct / 100);
      G.$('#a-pay', m.el).textContent = st.pct + '%';
      G.$('#a-pay-rs', m.el).textContent = st.price ? `(${rs(kidPays)} from my Gullak)` : '';
      const im = G.impact(st.price, kidPays);
      G.$('#a-impact', m.el).innerHTML = st.price ? `<div class="label">What happens if I buy it</div>${impactHTML({ nick: 'You', price: st.price, kidPays }, im)}
        ${kidPays > im.bal ? `<div class="warn">⚠️ You only have ${rs(Math.max(0, im.bal))}. Offer less, or save up first!</div>` : ''}` : '';
      const coolable = st.nw === 'want' && st.price >= S().settings.coolMin;
      G.$('#a-cool', m.el).innerHTML = coolable ? `<div class="cool-tip">🧊 <b>Smart-kid trick:</b> wants feel less exciting after a little wait.
        Put it in the <b>Cool-down Jar</b> for ${S().settings.coolHours >= 1 ? G.plural(S().settings.coolHours, 'hour') : G.plural(Math.round(S().settings.coolHours * 60), 'minute')} first?
        <button class="btn soft block mt" data-act="cool">🧊 Cool it first</button></div>` : '';
      const ok = itemEl.value.trim() && st.price > 0 && st.nw;
      btn.disabled = !ok; btn.textContent = ok ? '🙋 Ask a grown-up' : !itemEl.value.trim() ? 'What do you want?' : !st.price ? 'How much is it?' : 'Need or want?';
    };
    itemEl.addEventListener('input', upd);
    pctEl.addEventListener('input', () => { st.pct = +pctEl.value; upd(); });
    G.attachKeypad(m.el, { value: st.price, max: 200000, onChange: v => { st.price = v; upd(); } });
  };

  const countdown = (until) => {
    const ms = Math.max(0, until - G.now());
    const h = Math.floor(ms / 3600e3), mi = Math.floor(ms % 3600e3 / 60e3), se = Math.floor(ms % 60e3 / 1000);
    return h ? `${h}h ${mi}m` : `${mi}m ${String(se).padStart(2, '0')}s`;
  };

  /* ---------- Ask screen ---------- */
  G.screens.ask = {
    nav: 'ask',
    render: () => {
      const s = S(); const rq = s.requests;
      const cooling = rq.filter(r => r.status === 'cooling'), pending = rq.filter(r => r.status === 'pending');
      const waiting = rq.filter(r => r.status === 'wait'), past = rq.filter(r => ['approved', 'declined', 'dropped'].includes(r.status));
      const card = (r, extra) => `<div class="req ${r.status}"><span class="req-e">${r.emoji}</span><div class="grow">
          <b>${esc(r.item)}</b> <span class="muted">${rs(r.price)}</span>
          <small>${r.needOrWant === 'need' ? '🧩 need' : '✨ want'} · I pay ${rs(r.kidPays)}${r.deal === 'half' ? ' (half deal 🤝)' : ''}</small>
          ${r.parentNote ? `<small class="note">💬 "${esc(r.parentNote)}"</small>` : ''}${extra || ''}</div></div>`;
      return `<header class="page-h"><button class="back" data-act="go" data-to="home">←</button><h1>🙋 Can I buy this?</h1></header>
        <section class="card center ask-hero">
          <p>Want something? Ask a grown-up. Gullak shows them how it changes your money and your dream.</p>
          <button class="btn primary big block" data-act="new">➕ New ask</button>
          <div class="row gap mt"><input class="input grow" id="code" maxlength="20" placeholder="Got a reply code? e.g. YES-R7K2Q-4F9A" aria-label="Reply code" autocomplete="off">
          <button class="btn soft" data-act="code">Use</button></div>
        </section>
        ${cooling.length ? `<section class="card"><h3>🧊 Cool-down Jar</h3><p class="small muted">Wants wait here. If you still want it after the timer, ask!</p>
          ${cooling.map(r => card(r, r.coolUntil > G.now()
            ? `<div class="timer" data-until="${r.coolUntil}">⏳ ${countdown(r.coolUntil)} left</div>`
            : `<div class="row gap mt"><button class="btn small primary" data-act="still" data-id="${r.id}">Yes, I still want it</button>
               <button class="btn small soft" data-act="drop" data-id="${r.id}">Nah, skip it 💪</button></div>`)).join('')}</section>` : ''}
        ${pending.length ? `<section class="card"><h3>⏳ Waiting for a grown-up</h3>${pending.map(r => card(r,
          `<div class="row gap mt"><button class="btn small soft" data-act="share" data-id="${r.id}">📨 Show / send</button>
           <button class="link danger" data-act="cancel" data-id="${r.id}">Cancel</button></div>`)).join('')}</section>` : ''}
        ${waiting.length ? `<section class="card"><h3>📅 Wait a week</h3>${waiting.map(r => card(r, (r.waitUntil || 0) > G.now()
          ? `<small>Ask again on ${G.dateStr(r.waitUntil)}</small>` : `<button class="btn small primary mt" data-act="again" data-id="${r.id}">Ask again</button>`)).join('')}</section>` : ''}
        ${past.length ? `<section class="card"><h3>📜 Past asks</h3>${past.map(r => card(r,
          `<small class="badge-s ${r.status}">${r.status === 'approved' ? '✅ Yes' : r.status === 'dropped' ? '🧊 I skipped it, saved ' + rs(r.price) : '💭 Not this time'}</small>`)).join('')}</section>` : ''}
        ${s.meta.savedByWaiting ? `<section class="card center"><b>🧊 Cool-down Jar has saved you ${rs(s.meta.savedByWaiting)}!</b><br><small>${G.inUnits(s.meta.savedByWaiting, 'samosa').text} 🥟 you didn't waste.</small></section>` : ''}
        ${!rq.length ? '<p class="muted center">No asks yet. Tap ➕ New ask to try!</p>' : ''}`;
    },
    after: () => {
      const tick = () => {
        let expired = false;
        G.$$('.timer').forEach(t => { const u = +t.dataset.until; if (u <= G.now()) expired = true; else t.textContent = `⏳ ${countdown(u)} left`; });
        if (expired) { G.render(); }
      };
      G.timer = setInterval(tick, 1000);
      if (G.askPrefill) { const p = G.askPrefill; G.askPrefill = null; setTimeout(() => G.openAsk(p), 150); }
    },
    handlers: () => ({
      new: () => G.openAsk(),
      share: (el) => { const r = S().requests.find(x => x.id === el.dataset.id); if (r) G.openShare(r); },
      cancel: async (el) => { if (await G.confirm('Cancel this ask?', '', 'Cancel it', 'Keep')) { S().requests = S().requests.filter(r => r.id !== el.dataset.id); G.save(); G.render(); } },
      still: (el) => { const r = S().requests.find(x => x.id === el.dataset.id); r.status = 'pending'; G.save(); G.render(); G.openShare(r); },
      drop: (el) => {
        const r = S().requests.find(x => x.id === el.dataset.id); r.status = 'dropped'; r.decidedAt = G.now();
        S().meta.savedByWaiting += r.price; G.save(); G.confetti(); G.sound('win');
        G.toast(`💪 Cool head! You kept ${rs(r.price)} = ${G.inUnits(r.price, 'samosa').text}`, 4000); G.after(); G.render();
      },
      again: (el) => { const r = S().requests.find(x => x.id === el.dataset.id); r.status = 'pending'; r.seen = false; r.parentNote = ''; G.save(); G.render(); G.openShare(r); },
      code: () => {
        const raw = G.$('#code').value.trim().toUpperCase().replace(/[\s-]+/g, '');
        const m = raw.match(/^(YES|HALF|WAIT|NO)(R[A-Z0-9]{4})([A-Z0-9]{4})$/);
        if (!m) return G.toast('Hmm, that code looks wrong. It looks like YES-R7K2Q-4F9A');
        const chk = G.checkReply(m[2], CODE_TO[m[1]], m[3]);
        if (!chk.ok) return G.toast(chk.msg, 4500);
        const res = G.act.decide(m[2], CODE_TO[m[1]], '');
        if (!res.ok) return G.toast(res.why === 'already' ? 'That ask was already answered.' : 'No ask with that code on this phone.');
        res.r.seen = true; G.save();
        if (res.r.status === 'approved') { G.confetti(); G.sound('win'); } else G.sound('pop');
        G.toast(`${res.r.emoji} ${esc(res.r.item)}: ${DECISIONS[m[1] === 'HALF' ? 'half' : res.r.status].n}`, 3500); G.after(); G.render();
      }
    })
  };

  /* ---------- Grown-up mode (local PIN, not a login) ---------- */
  let pinBuf = '', pinFirst = null;
  G.parentUnlocked = false;
  const pinPad = (title, sub) => `<section class="card center pin">${G.piggy('calm', 110)}<h2>${title}</h2><p class="muted">${sub}</p>
      <div class="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="kp-grid pin-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button class="kp-key" data-act="pin" data-k="${k}">${k}</button>` : '<span></span>').join('')}</div></section>`;

  G.screens.grownup = {
    render: () => {
      const s = S();
      const head = `<header class="page-h"><button class="back" data-act="go" data-to="home">←</button><h1>🔒 Grown-up mode</h1></header>`;
      if (!s.pinHash) return head + pinPad(pinFirst ? 'Type it again' : 'Grown-ups: make a 4-digit PIN', 'This keeps kids from approving their own asks. It stays on this device only.');
      if (!G.parentUnlocked) return head + pinPad('Grown-ups only', 'Type your 4-digit PIN') + `<p class="center"><button class="link" data-act="forgot">Forgot PIN?</button></p>`;
      const pending = s.requests.filter(r => r.status === 'pending');
      const rep = G.report(); const p = s.profile;
      const choreDone = s.chores.filter(c => c.status === 'done');
      return head + `
        <section class="card"><div class="row between"><h3>${p.avatar} ${esc(p.nickname)}'s week</h3>${G.stars(rep.stars)}</div>
          <div class="grid3"><div><small>Got</small><b>${rs(rep.income)}</b></div><div><small>Spent</small><b>${rs(rep.total)}</b></div><div><small>Saved</small><b>${rs(rep.saved)}</b></div></div>
          <small class="muted">Spendable ${rs(G.balance())} · In dreams ${rs(G.totalInGoals())} · Wants ${rs(rep.want)} / Needs ${rs(rep.need)}</small>
          <div class="row gap mt"><button class="btn small good" data-act="give">💰 Give money</button><button class="btn small soft" data-act="gu-report">📊 Full report</button></div></section>
        <section class="card"><h3>🙋 Asks waiting (${pending.length})</h3>
          ${pending.length ? pending.map(r => { const im = G.impact(r.price, r.kidPays); return `<div class="req-p">
            <div class="row gap"><span class="req-e">${r.emoji}</span><div class="grow"><b>${esc(r.item)}</b> · ${rs(r.price)}<br>
            <small>${r.needOrWant === 'need' ? '🧩 Need' : '✨ Want'}${r.reasons && r.reasons.length ? ' · ' + r.reasons.map(esc).join(', ') : ''}</small>
            ${r.why ? `<small class="note">"${esc(r.why)}"</small>` : ''}</div></div>
            ${impactHTML(Object.assign({ nick: p.nickname }, r), im)}
            <input class="input" id="note-${r.id}" maxlength="80" placeholder="Add a note for your child (optional)">
            ${G.decButtons(r.price, r.kidPays, k => `data-act="decide" data-id="${r.id}" data-v="${k}"`)}
          </div>`; }).join('') : '<p class="muted">Nothing to decide right now. 👍</p>'}</section>
        <section class="card"><h3>🧹 Chores to earn money</h3>
          ${choreDone.length ? `<div class="label">Done, waiting for you</div>${choreDone.map(c => `<div class="chore"><span>${c.emoji}</span><b class="grow">${esc(c.name)}</b>
            <button class="btn small good" data-act="pay" data-id="${c.id}">Pay ${rs(c.reward)}</button><button class="btn small ghost" data-act="redo" data-id="${c.id}">Not done</button></div>`).join('')}` : ''}
          <div class="label">All chores</div>
          ${s.chores.filter(c => c.status !== 'done').map(c => `<div class="chore"><span>${c.emoji}</span><b class="grow">${esc(c.name)}</b><small>${rs(c.reward)} ${c.status === 'paid' ? '✅' : ''}</small>
            <button class="x" data-act="del-chore" data-id="${c.id}" aria-label="Delete chore">✕</button></div>`).join('') || '<p class="muted small">No chores yet.</p>'}
          <div class="row gap mt"><input class="input grow" id="ch-name" maxlength="30" placeholder="New chore, e.g. Water plants">
          <input class="input w80" id="ch-rew" type="number" inputmode="numeric" min="1" placeholder="₹"><button class="btn soft" data-act="add-chore">Add</button></div></section>
        <section class="card"><h3>⚙️ Grown-up settings</h3>
          <div class="label">🤝 Savings match: add a bonus when your child saves</div>
          <div class="chips">${[0, 5, 10, 25, 50].map(v => `<button class="chip ${Number(s.settings.matchPct) === v ? 'on' : ''}" data-act="match" data-v="${v}">${v ? v + '%' : 'Off'}</button>`).join('')}</div>
          <small class="muted">Like a bank paying interest: they save ₹100, you add ₹${s.settings.matchPct || 0}. Teaches that saving grows money.</small>
          <div class="label">🧊 Cool-down Jar timer for wants</div>
          <div class="chips">${[[1 / 60, '1 min (demo)'], [1, '1 hour'], [24, '24 hours'], [48, '2 days']].map(([v, n]) => `<button class="chip ${Math.abs(s.settings.coolHours - v) < 1e-6 ? 'on' : ''}" data-act="cool" data-v="${v}">${n}</button>`).join('')}</div>
          <div class="label">Suggest cool-down for wants above</div>
          <div class="chips">${[100, 200, 500, 1000].map(v => `<button class="chip ${s.settings.coolMin === v ? 'on' : ''}" data-act="coolmin" data-v="${v}">${rs(v)}</button>`).join('')}</div>
          <div class="row gap mt"><button class="btn soft grow" data-act="newpin">Change PIN</button><button class="btn primary grow" data-act="lock">🔒 Lock & exit</button></div></section>
        <section class="card tips"><h3>💡 Money talk tips for grown-ups</h3><ul>
          <li>Say <b>"not now"</b> with a reason. Kids learn more from the why.</li>
          <li>Try the <b>half deal</b>: when they pay part, they value it more.</li>
          <li>Ask: <i>"Is it a need or a want? Would you still want it next week?"</i></li>
          <li>Praise saving, not just buying. Check the Report Card together every Sunday.</li></ul></section>`;
    },
    handlers: () => ({
      pin: (el) => {
        const k = el.dataset.k; G.sound('tap');
        if (k === '⌫') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
        if (pinBuf.length === 4) {
          const s = S();
          if (!s.pinHash) {
            if (!pinFirst) { pinFirst = pinBuf; pinBuf = ''; }
            else if (pinFirst === pinBuf) { s.pinHash = G.hash(pinBuf); G.save(); G.parentUnlocked = true; pinFirst = null; pinBuf = ''; G.toast('🔒 PIN saved'); }
            else { pinFirst = null; pinBuf = ''; G.sound('bad'); G.toast('PINs didn\'t match. Try again.'); }
          } else if (G.hash(pinBuf) === s.pinHash) { G.parentUnlocked = true; pinBuf = ''; G.sound('coin'); }
          else { pinBuf = ''; G.sound('bad'); G.toast('Wrong PIN 🙅'); const d = G.$('.pin-dots'); if (d) d.classList.add('shake'); }
        }
        G.render();
      },
      forgot: async () => {
        if (await G.confirm('Reset the PIN?', 'This removes the PIN. Asks stay safe. Only grown-ups should do this!', 'Reset PIN', 'Cancel')) { S().pinHash = null; G.save(); G.render(); }
      },
      decide: (el) => {
        const id = el.dataset.id, v = el.dataset.v; const note = (G.$('#note-' + id) || {}).value || '';
        const res = G.act.decide(id, v, note.trim()); if (!res.ok) return;
        G.sound(v === 'declined' ? 'pop' : 'coin'); G.toast(`${DECISIONS[v].e} Sent: ${DECISIONS[v].n}`); G.after(); G.render();
      },
      give: () => G.openTxn('in', { cat: 'pocket', fromGrownup: true }),
      'gu-report': () => G.go('report', { gu: 1 }),
      pay: (el) => {
        const c = S().chores.find(x => x.id === el.dataset.id); c.status = 'paid';
        G.act.addTxn({ type: 'in', amount: c.reward, category: 'earned', note: c.emoji + ' ' + c.name });
        setTimeout(() => { if (c.repeat !== false) { S().chores.push({ id: G.uid(5), name: c.name, emoji: c.emoji, reward: c.reward, status: 'open' }); G.save(); G.render(); } }, 10);
        G.sound('coin'); G.after(); G.render();
      },
      redo: (el) => { const c = S().chores.find(x => x.id === el.dataset.id); c.status = 'open'; G.save(); G.render(); },
      'del-chore': (el) => { S().chores = S().chores.filter(c => c.id !== el.dataset.id); G.save(); G.render(); },
      'add-chore': () => {
        const name = G.$('#ch-name').value.trim(), rew = Math.round(Number(G.$('#ch-rew').value) || 0);
        if (!name || rew <= 0) return G.toast('Type a chore and a reward');
        const em = /plant|water|garden/i.test(name) ? '🪴' : /dish|plate|kitchen/i.test(name) ? '🍽️' : /room|tidy|clean/i.test(name) ? '🧺' : /car/i.test(name) ? '🚗' : /dog|cat|pet/i.test(name) ? '🐶' : /read|book/i.test(name) ? '📖' : '⭐';
        S().chores.push({ id: G.uid(5), name, emoji: em, reward: rew, status: 'open' }); G.save(); G.render();
      },
      match: (el) => { S().settings.matchPct = +el.dataset.v; G.save(); G.render(); },
      cool: (el) => { S().settings.coolHours = +el.dataset.v; G.save(); G.render(); },
      coolmin: (el) => { S().settings.coolMin = +el.dataset.v; G.save(); G.render(); },
      newpin: () => { S().pinHash = null; G.parentUnlocked = false; pinFirst = null; pinBuf = ''; G.save(); G.render(); },
      lock: () => { G.parentUnlocked = false; G.go('home'); }
    })
  };

  /* ---------- Signed answers: only someone who knows the grown-up PIN can approve ----------
     The answer carries a 4-character signature made from the PIN, the ask and the decision.
     The child's phone (which stores the PIN's hash) checks it, so a child can't fake "YES". */
  G.replyToken = (pinHash, id, status) => {
    const t = G.hash('reply|' + pinHash + '|' + id + '|' + status).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ('0000' + t).slice(-4);
  };
  G.checkReply = (id, status, token) => {
    const s = S(), m = s.meta;
    if (G.mode && G.mode() === 'family') return { ok: false, msg: 'In Family mode, a supervisor decides in their own login (👥 Switch user).' };
    if (!s.pinHash) return { ok: false, msg: 'Set up a grown-up PIN first (🔒 Grown-up mode), then ask again.' };
    if (m.replyLockUntil > G.now()) return { ok: false, msg: `Too many wrong answers. Try again after ${new Date(m.replyLockUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` };
    if (String(token || '').toUpperCase() !== G.replyToken(s.pinHash, id, status)) {
      m.replyFails = (m.replyFails || 0) + 1; if (m.replyFails >= 5) { m.replyLockUntil = G.now() + 10 * 60e3; m.replyFails = 0; }
      G.save(); G.sound('bad');
      return { ok: false, msg: '🔒 That answer wasn\'t signed with the right grown-up PIN, so it doesn\'t count.' };
    }
    m.replyFails = 0; G.save(); return { ok: true };
  };
  const pinOk = (pin) => /^\d{4}$/.test(pin);
  const ap = { r: null, pin: '', buf: '', ok: false, err: '' }; // approval-page PIN lock (kept in memory only)
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/parent')) Object.assign(ap, { pin: '', buf: '', ok: false, err: '' }); });

  /* ---------- Grown-up answers from a link (this phone or their own phone) ---------- */
  G.screens.parent = {
    bare: true,
    render: (q) => {
      const d = G.b64d(q.r || '');
      if (!d || !d.id) return `<section class="card center">${G.piggy('worried', 120)}<h2>Hmm, this link is broken</h2><p class="muted">Ask your child to send it again.</p><a class="btn soft" href="#/home">Open Gullak</a></section>`;
      const dec = q.done ? DECISIONS[q.done] : null;
      const parentPays = Math.max(0, d.p - d.k);
      const local = !!(S().profile && S().requests.some(r => r.id === d.id));
      if (G.mode && G.mode() === 'family') return `<section class="card center">${G.piggy('calm', 110)}<h2>Family mode</h2>
        <p>In a family, supervisors decide asks from their own login. No links needed.</p><a class="btn primary block" href="#/home">OK</a></section>`;
      if (q.later) return `<section class="card center">${G.piggy('calm', 120)}<h2>⏰ No rush!</h2>
        <p>The ask for ${esc(d.e)} <b>${esc(d.item)}</b> is still waiting.</p>
        <p class="muted">${local ? 'You can decide any time in 🔒 Grown-up mode on this phone.' : `Open this link again any time, or decide in 🔒 Grown-up mode on ${esc(d.nick || 'your child')}'s phone.`}</p>
        ${local ? '<a class="btn primary block" href="#/home">OK</a>' : '<button class="btn soft block" data-act="change">← Back to the ask</button>'}</section>`;
      if (dec) {
        const t = String(q.t || '');
        const reply = G.appBase() + '#/reply?r=' + G.b64e({ id: d.id, s: q.done, n: q.note || '', t });
        const code = dec.code + '-' + d.id + '-' + t;
        G._reply = { reply, code, text: `Gullak answer for ${d.e} ${d.item}: ${dec.e} ${dec.n}${q.note ? ' "' + q.note + '"' : ''}. Tap: ${reply}  (or type code ${code})` };
        return `<section class="card center">${G.piggy(q.done === 'declined' ? 'calm' : 'happy', 120)}<h2>${dec.e} ${dec.n}</h2>
          <p>Now send your answer back to ${esc(d.av)} ${esc(d.nick)}:</p>
          <div class="col gap"><button class="btn wa block big" data-act="wa">📲 Send answer on WhatsApp</button>
          <button class="btn soft block" data-act="copy">📋 Copy answer link</button></div>
          <p class="muted mt">Or they can type this code on their Ask screen:</p><div class="code">${code}</div>
          <p class="fine">🔒 This answer is signed with your grown-up PIN. If the PIN was wrong, your child's Gullak will reject it.</p>
          <button class="link mt" data-act="change">← Change my answer</button></section>`;
      }
      // 🔒 PIN lock in front of the whole ask: nothing shows until the grown-up PIN is typed
      if (ap.r !== q.r) Object.assign(ap, { r: q.r, pin: '', buf: '', ok: false, err: '' });
      if (!ap.ok) {
        const lockedUntil = S().meta && S().meta.replyLockUntil > G.now() ? S().meta.replyLockUntil : 0;
        return `<section class="card center pin">${G.piggy('calm', 110)}<h2>🔒 Grown-ups only</h2>
          <p class="muted">${esc(d.nick || 'Your child')} sent an ask. Type the <b>grown-up PIN</b> to see it and answer.</p>
          ${lockedUntil ? `<p class="minus">Too many wrong PINs. Try again after ${new Date(lockedUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}
          <div class="pin-dots ${ap.err ? 'shake' : ''}">${[0, 1, 2, 3].map(i => `<i class="${i < ap.buf.length ? 'on' : ''}"></i>`).join('')}</div>
          ${ap.err ? `<p class="minus small">${esc(ap.err)}</p>` : ''}
          <div class="kp-grid pin-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button class="kp-key" data-act="appin" data-k="${k}" ${lockedUntil ? 'disabled' : ''}>${k}</button>` : '<span></span>').join('')}</div>
          ${local ? '<a class="link mt" href="#/home">Not a grown-up? Go back</a>' : ''}</section>`;
      }
      return `<section class="card parent-ask">
        <div class="center"><span class="huge">${esc(d.av || '🧒')}</span><h2>${esc(d.nick || 'Your child')} is asking:</h2></div>
        <div class="ask-big"><span>${esc(d.e)}</span><b>Can I buy ${esc(d.item)}?</b><div class="price">${rs(d.p)}</div></div>
        <div class="kv"><span>Need or want</span><b>${d.nw === 'need' ? '🧩 Need' : '✨ Want'}</b></div>
        ${d.rs && d.rs.length ? `<div class="kv"><span>Reasons</span><b>${d.rs.map(esc).join(', ')}</b></div>` : ''}
        ${d.why ? `<p class="note">💬 "${esc(d.why)}"</p>` : ''}
        <div class="impact">
          <div class="kv"><span>🐷 They have</span><b>${rs(d.bal)}</b></div>
          <div class="kv"><span>🧒 They'll pay</span><b>${rs(d.k)}</b></div>
          <div class="kv"><span>🧑 You'd pay</span><b>${rs(parentPays)}</b></div>
          <div class="kv"><span>💰 Left after</span><b>${rs(d.bal - d.k)}</b></div>
          ${d.g ? `<div class="delay">⏪ Their ${esc(d.g.emoji)} ${esc(d.g.name)} (${d.g.pct}% saved) moves back <b>${G.plural(d.db || 0, 'day')}</b></div>` : ''}
        </div>
        <input class="input" id="p-note" maxlength="80" placeholder="Add a note, e.g. Let's wait for the sale" aria-label="Note">
        ${G.decButtons(d.p, d.k, k => `data-act="pick" data-v="${k}"`)}
        <button class="btn ghost block" data-act="aplock">🔒 Lock</button>
        <p class="fine">Only a grown-up who knows the PIN can answer. No money moves anywhere; this is a practice app with pretend amounts.</p></section>`;
    },
    handlers: (q) => ({
      appin: (el) => {
        const k = el.dataset.k; G.sound('tap'); ap.err = '';
        if (k === '⌫') ap.buf = ap.buf.slice(0, -1); else if (ap.buf.length < 4) ap.buf += k;
        if (ap.buf.length === 4) {
          const d = G.b64d(q.r); const s = S();
          const local = !!(s.profile && s.requests.some(r => r.id === d.id));
          if (local) { // this phone knows the PIN: check it now (5 wrong tries → 10-minute lock)
            if (!s.pinHash) { ap.buf = ''; G.toast('Set up a grown-up PIN first in 🔒 Grown-up mode.'); return G.render({ keepScroll: true }); }
            if (G.hash(ap.buf) !== s.pinHash) {
              s.meta.replyFails = (s.meta.replyFails || 0) + 1; if (s.meta.replyFails >= 5) { s.meta.replyLockUntil = G.now() + 10 * 60e3; s.meta.replyFails = 0; }
              G.save(); G.sound('bad'); ap.buf = ''; ap.err = 'Wrong PIN'; return G.render({ keepScroll: true });
            }
            s.meta.replyFails = 0; G.save();
          }
          // other phone: it can't check the PIN, but every answer is signed with it, so a wrong PIN gets rejected on the child's phone
          ap.pin = ap.buf; ap.buf = ''; ap.ok = true; G.sound('coin');
        }
        G.render({ keepScroll: true });
      },
      aplock: () => { Object.assign(ap, { pin: '', buf: '', ok: false, err: '' }); G.render(); },
      pick: (el) => {
        const d = G.b64d(q.r); const v = el.dataset.v;
        const note = G.$('#p-note').value.trim(); const pin = ap.pin;
        if (!pinOk(pin)) { ap.ok = false; return G.render(); }
        const ph = G.hash(pin);
        const local = !!(S().profile && S().requests.some(r => r.id === d.id));
        if (local) { // same phone: check the PIN right here and apply straight away
          const chk = G.checkReply(d.id, v, G.replyToken(ph, d.id, v));
          if (!chk.ok) { Object.assign(ap, { pin: '', ok: false }); G.render(); return G.toast(chk.msg.replace('That answer wasn\'t signed with the right grown-up PIN, so it doesn\'t count.', 'Wrong grown-up PIN.'), 3500); }
          const res = G.act.decide(d.id, v, note);
          if (!res.ok) return G.toast(res.why === 'already' ? 'This ask was already answered.' : 'Ask not found.');
          Object.assign(ap, { pin: '', ok: false }); // lock again after answering
          G.sound('coin'); G.after(); G.toast(`✅ Answer saved: ${DECISIONS[v].e} ${DECISIONS[v].n}`, 3000); return G.go('home');
        }
        G.go('parent', { r: q.r, done: v, note, t: G.replyToken(ph, d.id, v) }); // other phone: sign and send back
      },
      later: () => G.go('parent', { r: q.r, later: 1 }),
      change: () => G.go('parent', { r: q.r }),
      wa: () => G.whatsapp(G._reply.text),
      copy: () => G.copy(G._reply.reply)
    })
  };

  /* ---------- Kid opens the grown-up's reply link ---------- */
  G.screens.reply = {
    bare: true,
    render: (q) => {
      const d = G.b64d(q.r || '');
      if (!d || !d.id) return `<section class="card center"><h2>This reply link is broken 😕</h2><a class="btn soft" href="#/home">Go home</a></section>`;
      if (!S().profile) return `<section class="card center">${G.piggy('sleepy', 120)}<h2>Open this on your child's phone</h2><p class="muted">This answer belongs to the Gullak where the ask was made.</p></section>`;
      if (!G._applied || G._applied !== q.r) {
        G._applied = q.r;
        const chk = G.checkReply(d.id, d.s, d.t); // must be signed with the grown-up PIN
        if (!chk.ok) G._replyRes = { ok: false, why: 'unsigned', msg: chk.msg };
        else {
          const res = G.act.decide(d.id, d.s, d.n);
          G._replyRes = res; if (res.ok) { res.r.seen = true; G.save(); setTimeout(() => { G.after(); if (res.r.status === 'approved') { G.confetti(); G.sound('win'); } }, 200); }
        }
      }
      const res = G._replyRes;
      if (!res.ok && res.why === 'unsigned') return `<section class="card center">${G.piggy('worried', 120)}<h2>This answer doesn't count</h2>
        <p>${esc(res.msg)}</p><p class="muted small">Ask your grown-up to open your ask link and decide with their PIN.</p><a class="btn soft block" href="#/ask">Go to my asks</a></section>`;
      if (!res.ok && res.why === 'missing') return `<section class="card center"><h2>Hmm 🤔</h2><p class="muted">This ask isn't on this phone.</p><a class="btn soft" href="#/ask">Go to my asks</a></section>`;
      const r = res.r; const dec = DECISIONS[d.s];
      return `<section class="card center">${G.piggy(r.status === 'approved' ? 'excited' : 'calm', 140)}
        <h2>${r.emoji} ${esc(r.item)}</h2><div class="answer">${dec.e} ${dec.n}</div>
        ${r.parentNote ? `<p class="note">💬 "${esc(r.parentNote)}"</p>` : ''}
        ${r.status === 'approved' && r.kidPays ? `<p>${rs(r.kidPays)} came out of your Gullak. Enjoy it! 🎉</p>` : ''}
        ${r.status === 'wait' ? '<p>You can ask again in a week. Maybe you won\'t even want it by then!</p>' : ''}
        ${r.status === 'declined' ? '<p>That\'s okay! Your money stays safe for your dream. 🐷</p>' : ''}
        ${!res.ok && res.why === 'already' ? '<p class="muted small">(This answer was already added.)</p>' : ''}
        <a class="btn primary block big" href="#/home">Go home</a></section>`;
    },
    handlers: () => ({})
  };

  /* ---------- Kid side: earn by helping ---------- */
  G.screens.chores = {
    render: () => {
      const ch = S().chores;
      return `<header class="page-h"><button class="back" data-act="go" data-to="home">←</button><h1>🧹 Earn money</h1></header>
        <section class="card"><p class="muted">Do a job, tap <b>I did it!</b>, and a grown-up pays you (pretend money) in Grown-up mode.</p>
        ${ch.filter(c => c.status !== 'paid').map(c => `<div class="chore"><span>${c.emoji}</span><div class="grow"><b>${esc(c.name)}</b><small>${rs(c.reward)} · ${G.activeGoal() ? `${G.plural(G.daysBack(c.reward) || 1, 'day')} closer to your ${esc(G.activeGoal().name)}` : ''}</small></div>
          ${c.status === 'open' ? `<button class="btn small primary" data-act="did" data-id="${c.id}">I did it!</button>` : '<small class="badge-s">⏳ Waiting</small>'}</div>`).join('') ||
          '<p class="muted center">No jobs yet. Ask a grown-up to add some in 🔒 Grown-up mode.</p>'}
        ${ch.some(c => c.status === 'paid') ? `<div class="label">Done & paid</div>${ch.filter(c => c.status === 'paid').map(c => `<div class="chore done"><span>${c.emoji}</span><b class="grow">${esc(c.name)}</b><small>+${rs(c.reward)} ✅</small></div>`).join('')}` : ''}
        <button class="btn soft block mt" data-act="go" data-to="grownup">🔒 Grown-up: add or pay chores</button></section>`;
    },
    handlers: () => ({
      did: (el) => { const c = S().chores.find(x => x.id === el.dataset.id); c.status = 'done'; G.save(); G.sound('pop'); G.toast('🙌 Great job! A grown-up will check and pay you.'); G.render(); }
    })
  };
})(window.G);
