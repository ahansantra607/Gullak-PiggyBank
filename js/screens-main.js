/* Gullak screens: Welcome, Home, Q1 "Where did my money go?", Q2 "My Dream". */
(function (G) {
  const S = () => G.S;
  G.screens = G.screens || {};
  const esc = G.esc, rs = G.rs;
  const junior = () => !S().profile || S().profile.ageGroup !== 'senior';

  /* =====================================================================
     Shared money modals
     ===================================================================== */
  G.openTxn = (type = 'out', opts = {}) => {
    const isOut = type === 'out';
    const st = { amount: 0, cat: opts.cat || null, nw: opts.nw || null };
    const cats = isOut ? G.SPEND_CATS.map(k => [k, G.CATS[k]]) : Object.entries(G.SOURCES);
    const g = G.activeGoal();
    let upd = () => {};
    const m = G.modal({
      html: `<h2>${isOut ? '💸 I spent money' : opts.fromGrownup ? `💰 Give money to ${esc(S().profile.nickname)}` : '💰 I got money'}</h2>
        ${G.keypadHTML(isOut ? [10, 20, 50, 100] : [50, 100, 200, 500])}
        <div class="preview" id="tx-prev"></div>
        <div class="label">${isOut ? 'What was it for?' : 'Where did it come from?'}</div>
        <div class="pick-grid">${cats.map(([k, c]) => `<button class="pick ${st.cat === k ? 'on' : ''}" data-act="cat" data-v="${k}"><span>${c.e}</span><small>${c.n}</small></button>`).join('')}</div>
        ${isOut ? `<div class="label">Was it a… ${G.speakBtn('Was it a need, something you must have, or a want, something nice to have?')}</div>
          <div class="seg"><button class="seg-b" data-act="nw" data-v="need">🧩 Need<small>I must have it</small></button>
          <button class="seg-b" data-act="nw" data-v="want">✨ Want<small>nice to have</small></button></div>` : ''}
        <input class="input" id="tx-note" maxlength="40" placeholder="${isOut ? 'What was it? e.g. samosa (optional)' : 'Note, e.g. from Nani (optional)'}" aria-label="Note">
        <button class="btn primary block big" data-act="save" disabled>Save</button>`,
      handlers: {
        speak: (el) => G.speak(el.dataset.text, true),
        cat: (el) => { st.cat = el.dataset.v; G.$$('.pick', m.el).forEach(b => b.classList.toggle('on', b === el)); G.sound('tap'); upd(); },
        nw: (el) => { st.nw = el.dataset.v; G.$$('.seg-b', m.el).forEach(b => b.classList.toggle('on', b === el)); G.sound('tap'); upd(); },
        save: () => {
          const note = G.$('#tx-note', m.el).value.trim();
          const t = G.act.addTxn({ type, amount: st.amount, category: st.cat, needOrWant: st.nw || undefined, note });
          if (!t) return;
          m.close();
          if (isOut) {
            G.sound('pop');
            const dly = g ? G.daysBack(st.amount) : 0;
            G.toast(`Noted! ${rs(st.amount)} on ${G.CATS[st.cat].e}${g ? ` · your ${esc(g.name)} moved back ${G.plural(dly, 'day')} ⏪` : ''}`);
            G.after(); G.render();
          } else {
            G.sound('coin');
            if (opts.fromGrownup) { // money from a grown-up goes straight to the kid; the dream prompt waits until the kid is back
              S().meta.pendingGift = (S().meta.pendingGift || 0) + st.amount; G.save(); G.after(); G.render();
              return G.toast(`💰 ${rs(st.amount)} given to ${esc(S().profile.nickname)}. They'll see it on their home screen.`, 3500);
            }
            G.after(); G.render();
            if (G.activeGoal() && st.amount >= 10) setTimeout(() => G.saveNudge(st.amount), 350);
            else G.toast(`Yay! +${rs(st.amount)} in your Gullak 🐷`);
          }
        }
      }
    });
    const prev = G.$('#tx-prev', m.el); const saveBtn = G.$('[data-act=save]', m.el);
    upd = () => {
      const a = st.amount; const u = G.inUnits(a, S().settings.unit === 'goal' ? 'samosa' : S().settings.unit);
      let html = a ? `<b>${rs(a)}</b> = ${u.text} <span class="erow">${G.emojiRow(u.n, u.e, 10)}</span>` : '<span class="muted">Tap the numbers to type the amount</span>';
      if (a && isOut && g) html += `<div class="delay">⏪ This pushes your <b>${esc(g.name)} ${g.emoji}</b> back <b>${G.plural(G.daysBack(a), 'day')}</b></div>`;
      if (a && !isOut && g) html += `<div class="delay good">⏩ That's <b>${Math.round(a / g.target * 100)}%</b> of your ${esc(g.name)} ${g.emoji}!</div>`;
      if (a && isOut && a > G.balance()) html += `<div class="warn">⚠️ That's more than your Gullak has (${rs(Math.max(0, G.balance()))}). Did you forget to add some money you got?</div>`;
      prev.innerHTML = html;
      const insufficient = isOut && a > G.balance();
      saveBtn.disabled = !(a > 0 && st.cat && (!isOut || st.nw) && !insufficient);
      saveBtn.textContent = insufficient ? 'Not enough money' : !a ? 'Type an amount' : !st.cat ? (isOut ? 'Pick what it was for' : 'Pick where it came from') : (isOut && !st.nw) ? 'Need or want?' : 'Save ' + rs(a);
    };
    G.attachKeypad(m.el, { value: opts.amount || 0, onChange: (v) => { st.amount = v; upd(); } });
  };

  /* "Pay yourself first" nudge right after money comes in */
  G.saveNudge = (amount) => {
    const g = G.activeGoal(); if (!g) return;
    const opts = [10, 20, 50].map(p => ({ p, a: Math.max(1, Math.round(amount * p / 100)) }));
    const m = G.modal({
      html: `<div class="center">${G.piggy('excited', 120)}<h2>Feed your dream first?</h2>
        <p class="muted">Smart savers put some away <b>before</b> spending. How much of your ${rs(amount)} goes to your ${esc(g.name)} ${g.emoji}?</p></div>
        <div class="col gap">${opts.map(o => `<button class="btn ${o.p === 20 ? 'primary' : 'soft'} block" data-act="pick" data-a="${o.a}">
          Save ${o.p}% · ${rs(o.a)} <small>(${G.plural(G.daysBack(o.a), 'day')} closer)</small></button>`).join('')}
        <button class="btn ghost block" data-act="close">Not this time</button></div>`,
      handlers: {
        pick: (el) => {
          const a = Math.min(Number(el.dataset.a), Math.max(0, G.balance()));
          if (a > 0) { const bonus = G.act.saveToGoal(g.id, a); G.sound('coin'); G.toast(`🪙 ${rs(a)} fed to your ${esc(g.name)}!${bonus ? ` + 🤝 ${rs(bonus)} grown-up match!` : ''}`); }
          m.close(); G.after(); G.render();
        }
      }
    });
  };

  /* Move money between spendable and a dream jar */
  /* Move money between spendable and a dream jar */
  G.openMove = (gid, dir = 'to') => {
    const g = S().goals.find(x => x.id === gid); if (!g) return;
    const saved = G.goalSaved(gid);
    const rem = Math.max(0, g.target - saved);
    if (dir === 'to' && rem <= 0) return G.toast('Your dream is already 100% saved! 🎉 Pick a new dream or buy this one.');
    
    const max = dir === 'to' ? Math.min(Math.max(0, G.balance()), rem) : saved;
    if (max <= 0) return G.toast(dir === 'to' ? 'Your Gullak is empty right now. Add money you got first! 💰' : 'Nothing in this dream jar yet.');
    
    let amt = 0;
    const m = G.modal({
      html: `<h2>${dir === 'to' ? `🪙 Feed my ${esc(g.name)}` : `😬 Take money out of my ${esc(g.name)}`}</h2>
        <p class="muted">${dir === 'to' ? `You can move up to ${rs(max)} (needed to reach your target).` : `There's ${rs(max)} inside. Taking it out pushes your dream back.`}</p>
        ${G.keypadHTML(dir === 'to' ? [10, 20, 50, 100] : [10, 50, 100])}
        <div class="preview" id="mv-prev"></div>
        <button class="btn ${dir === 'to' ? 'primary' : 'danger'} block big" data-act="ok" disabled>Move</button>`,
      handlers: {
        ok: () => {
          if (!amt) return;
          const bonus = dir === 'to' ? G.act.saveToGoal(gid, amt) : (G.act.addTxn({ type: 'fromGoal', amount: amt, goalId: gid }), 0);
          if (bonus) setTimeout(() => G.toast(`🤝 Grown-up match: +${rs(bonus)} to your dream!`), 900);
          G.sound(dir === 'to' ? 'coin' : 'pop'); m.close();
          G.toast(dir === 'to' ? `🪙 +${rs(amt)} to your ${esc(g.name)}!` : `Took out ${rs(amt)}. Your ${esc(g.name)} moved back ${G.plural(G.daysBack(amt), 'day')}.`);
          G.after(); G.render();
        }
      }
    });
    const prev = G.$('#mv-prev', m.el), btn = G.$('[data-act=ok]', m.el);
    G.attachKeypad(m.el, { max, onChange: (v) => {
      amt = v; btn.disabled = !v;
      btn.textContent = v ? (dir === 'to' ? `Save ${rs(v)}` : `Take out ${rs(v)}`) : 'Type an amount';
      const after = G.goalSaved(gid) + (dir === 'to' ? v : -v);
      prev.innerHTML = v ? `${G.progress(after / g.target * 100)}<div class="small">${rs(after)} of ${rs(g.target)} · ${dir === 'to' ? '⏩' : '⏪'} ${G.plural(G.daysBack(v), 'day')} ${dir === 'to' ? 'sooner' : 'later'}</div>` : '';
    } });
  };

  /* Create a dream */
  G.openGoalCreate = () => {
    const st = { e: '🚲', n: '', t: 0 };
    const emojis = Array.from(new Set(G.GOAL_PRESETS.map(p => p.e).concat(G.EMOJI_PICK)));
    let kp, upd = () => {};
    const m = G.modal({
      html: `<h2>🌈 Pick a dream</h2>
        <div class="label">Quick picks</div>
        <div class="pick-grid four">${G.GOAL_PRESETS.map((p, i) => `<button class="pick" data-act="preset" data-i="${i}"><span>${p.e}</span><small>${p.n}<br>${rs(p.t)}</small></button>`).join('')}</div>
        <div class="label">…or make your own</div>
        <div class="emoji-row">${emojis.map(e => `<button class="emo ${e === st.e ? 'on' : ''}" data-act="emo" data-v="${e}">${e}</button>`).join('')}</div>
        <input class="input" id="g-name" maxlength="22" placeholder="My dream is… e.g. Cycle" aria-label="Dream name">
        <div class="label">It costs about</div>
        ${G.keypadHTML([100, 500, 1000])}
        <div class="preview" id="g-prev"></div>
        <button class="btn primary block big" data-act="ok" disabled>Start saving!</button>`,
      handlers: {
        preset: (el) => { const p = G.GOAL_PRESETS[+el.dataset.i]; st.e = p.e; G.$('#g-name', m.el).value = p.n; kp.set(p.t); markEmo(); upd(); },
        emo: (el) => { st.e = el.dataset.v; markEmo(); upd(); },
        ok: () => {
          const name = G.$('#g-name', m.el).value.trim(); if (!name || !st.t) return;
          G.act.addGoal({ name, emoji: st.e, target: st.t });
          m.close(); G.sound('win'); G.confetti(80); G.after(); G.go('goal');
        }
      }
    });
    const markEmo = () => G.$$('.emo', m.el).forEach(b => b.classList.toggle('on', b.dataset.v === st.e));
    const prev = G.$('#g-prev', m.el), btn = G.$('[data-act=ok]', m.el), nameEl = G.$('#g-name', m.el);
    upd = () => {
      const name = nameEl.value.trim(); btn.disabled = !(name && st.t >= 10);
      const days = Math.ceil(st.t / G.dailySaving());
      prev.innerHTML = st.t ? `${st.e} ${esc(name || 'Your dream')} = ${G.inUnits(st.t, 'samosa').text} 🥟<br><span class="small">If you save about ${rs(G.dailySaving() * 7)} a week, that's around <b>${G.plural(Math.ceil(days / 7), 'week')}</b>.</span>` : '';
    };
    nameEl.addEventListener('input', upd);
    kp = G.attachKeypad(m.el, { max: 200000, onChange: (v) => { st.t = v; upd(); } });
  };

  /* Pick a "Money Lens" unit */
  G.cycleUnit = () => {
    const us = G.allUnits(); const i = us.findIndex(u => u.id === S().settings.unit);
    S().settings.unit = us[(i + 1) % us.length].id; G.save(); G.sound('tap'); G.render();
  };

  /* =====================================================================
     Welcome / onboarding (about 20 seconds)
     ===================================================================== */
  const ob = { step: 0, nickname: '', avatar: '🦁', ageGroup: 'junior', pocketMoney: 100, frequency: 'weekly', start: 0, goal: null };
  // Every new setup starts blank (no leftovers from a previous kid after "Start over")
  G.obStart = (step) => { Object.assign(ob, { step, nickname: '', avatar: '🦁', ageGroup: 'junior', pocketMoney: 100, frequency: 'weekly', start: 0, goal: null }); };
  G.screens.welcome = {
    render: () => {
      const dots = `<div class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>`;
      if (ob.step === 0) return `<section class="welcome">
        <div class="hero">${G.piggy('happy', 190)}</div>
        <h1 class="brand">Gullak</h1>
        <p class="tag">Your talking piggy bank that turns money into samosas, saves for your dreams, and helps you ask Mum or Dad. 🐷</p>
        <button class="btn primary block big" data-act="next">Start my Gullak ✨</button>
        <button class="btn soft block" data-act="sample">👀 Try it with sample data</button>
        <p class="fine">🔒 No real money. No sign-up. No real names.<br>Everything stays on this device.</p>
      </section>`;
      if (ob.step === 1) return `<section class="ob">${dots}<h2>Who are you? 🙂</h2>
        <div class="label">Pick your buddy</div>
        <div class="avatar-grid">${G.AVATARS.map(a => `<button class="av ${a === ob.avatar ? 'on' : ''}" data-act="av" data-v="${a}">${a}</button>`).join('')}</div>
        <div class="label">Give yourself a nickname</div>
        <input class="input big" id="ob-nick" maxlength="14" placeholder="e.g. Rocket" value="${esc(ob.nickname)}" aria-label="Nickname" autocomplete="off">
        <p class="hint">🙈 Use a fun nickname, <b>not</b> your real name.</p>
        <button class="btn primary block big" data-act="next1">Next →</button></section>`;
      if (ob.step === 2) return `<section class="ob">${dots}<h2>How old are you?</h2>
        <div class="col gap">
          <button class="card-btn ${ob.ageGroup === 'junior' ? 'on' : ''}" data-act="age" data-v="junior"><span class="big">🧒</span><b>8 to 12</b><small>Junior: fun pictures, simple words</small></button>
          <button class="card-btn ${ob.ageGroup === 'senior' ? 'on' : ''}" data-act="age" data-v="senior"><span class="big">🧑</span><b>13 to 18</b><small>Senior: charts, more dreams, budgets</small></button>
        </div>
        <button class="btn primary block big" data-act="next">Next →</button>
        <button class="btn ghost block" data-act="back">← Back</button></section>`;
      if (ob.step === 3) return `<section class="ob">${dots}<h2>Pocket money 💰</h2>
        <p class="muted">How much do you usually get? (Pretend amounts are fine!)</p>
        <div class="seg"><button class="seg-b ${ob.frequency === 'weekly' ? 'on' : ''}" data-act="freq" data-v="weekly">Every week</button>
          <button class="seg-b ${ob.frequency === 'monthly' ? 'on' : ''}" data-act="freq" data-v="monthly">Every month</button></div>
        ${G.keypadHTML([50, 100, 200, 500])}
        <button class="btn primary block big" data-act="next3">Next →</button>
        <button class="btn ghost block" data-act="none">I don't get pocket money</button></section>`;
      if (ob.step === 4) return `<section class="ob">${dots}<h2>What's in your gullak now? 🐷</h2>
        <p class="muted">How much money do you have right now? Guess is okay!</p>
        ${G.keypadHTML([50, 100, 500, 1000])}
        <button class="btn primary block big" data-act="next4">Next →</button>
        <button class="btn ghost block" data-act="back">← Back</button></section>`;
      return `<section class="ob">${dots}<h2>What's your big dream? 🌈</h2>
        <p class="muted">Pick something to save for. You can change it later.</p>
        <div class="pick-grid four">${G.GOAL_PRESETS.map((p, i) => `<button class="pick ${ob.goal === i ? 'on' : ''}" data-act="goal" data-i="${i}"><span>${p.e}</span><small>${p.n}<br>${rs(p.t)}</small></button>`).join('')}</div>
        <button class="btn primary block big" data-act="finish" ${ob.goal == null ? 'disabled' : ''}>Let's go! 🚀</button>
        <button class="btn ghost block" data-act="finish-skip">I'll pick later</button></section>`;
    },
    after: (root) => {
      if (ob.step === 3) G.attachKeypad(G.$('.kp', root), { value: ob.pocketMoney, max: 50000, onChange: v => { ob.pocketMoney = v; } });
      if (ob.step === 4) G.attachKeypad(G.$('.kp', root), { value: ob.start, max: 200000, onChange: v => { ob.start = v; } });
      const nick = G.$('#ob-nick', root); if (nick) { nick.focus(); nick.addEventListener('input', () => { ob.nickname = nick.value; }); }
    },
    handlers: () => {
      const finish = (withGoal) => {
        const s = G.fresh(); const t = G.now();
        s.profile = { nickname: ob.nickname.trim() || 'Champ', avatar: ob.avatar, ageGroup: ob.ageGroup, pocketMoney: ob.pocketMoney, frequency: ob.frequency, createdAt: t };
        s.meta.lastPayday = t; s.meta.lastOpen = t; s.meta.prevOpen = t;
        G.S = s;
        if (ob.start > 0) G.act.addTxn({ type: 'in', amount: ob.start, category: 'other', note: 'Money I already had' });
        if (withGoal && ob.goal != null) { const p = G.GOAL_PRESETS[ob.goal]; G.act.addGoal({ name: p.n, emoji: p.e, target: p.t }); }
        G.save(); G.after(); G.sound('win'); G.confetti(); ob.step = 0; G.go('home');
      };
      return {
        next: () => { ob.step++; G.sound('tap'); G.render(); },
        back: () => { ob.step = Math.max(0, ob.step - 1); G.render(); },
        sample: () => { G.act.loadSample(); G.sound('win'); G.toast('Sample Gullak loaded! Grown-up PIN is <b>1234</b>', 4000); G.go('home'); },
        av: (el) => { ob.avatar = el.dataset.v; G.$$('.av').forEach(b => b.classList.toggle('on', b === el)); G.sound('tap'); },
        next1: () => { ob.nickname = G.$('#ob-nick').value; if (!ob.nickname.trim()) { G.$('#ob-nick').focus(); return G.toast('Type a fun nickname first 🙂'); } ob.step = 2; G.render(); },
        age: (el) => { ob.ageGroup = el.dataset.v; G.render(); },
        freq: (el) => { ob.frequency = el.dataset.v; G.$$('.seg-b').forEach(b => b.classList.toggle('on', b === el)); },
        next3: () => { ob.step = 4; G.render(); },
        none: () => { ob.pocketMoney = 0; ob.step = 4; G.render(); },
        next4: () => { ob.step = 5; G.render(); },
        goal: (el) => { ob.goal = +el.dataset.i; G.render(); },
        finish: () => finish(true),
        'finish-skip': () => finish(false)
      };
    }
  };

  /* =====================================================================
     Home
     ===================================================================== */
  G.screens.home = {
    nav: 'home',
    render: () => {
      const s = S(), p = s.profile, bal = G.balance(), mood = G.mood(), g = G.activeGoal();
      const u = G.inUnits(bal); const wk = G.spendBreakdown('week');
      const pendingAsk = s.requests.filter(r => r.status === 'pending').length;
      const news = s.requests.filter(r => (r.status === 'approved' || r.status === 'declined' || r.status === 'wait') && !r.seen);
      const coolReady = s.requests.filter(r => r.status === 'cooling' && r.coolUntil <= G.now());
      const choresOpen = s.chores.filter(c => c.status === 'open').length;
      const banners = [];
      if (s.meta.pendingGift > 0) banners.push(`<div class="banner good">🎁 A grown-up gave you <b>${rs(s.meta.pendingGift)}</b>! It's in your Gullak.
        ${G.activeGoal() ? '<button class="btn small primary" data-act="gift-feed">🪙 Feed my dream</button> ' : ''}<button class="link" data-act="gift-ok">OK</button></div>`);
      if (s.meta.sample) banners.push(`<div class="banner info">👀 You're looking at <b>sample data</b>. Grown-up PIN is <b>1234</b>. <button class="link" data-act="reset-real">Start my own →</button></div>`);
      if (G.paydayDue()) banners.push(`<div class="banner good">🗓️ Pocket money day! Did you get your <b>${rs(p.pocketMoney)}</b>? <button class="btn small primary" data-act="payday">Yes, add it</button> <button class="link" data-act="payday-skip">Not yet</button></div>`);
      news.forEach(r => banners.push(`<div class="banner ${r.status === 'approved' ? 'good' : r.status === 'wait' ? 'info' : 'bad'}">
        ${r.emoji} <b>${esc(r.item)}</b>: ${r.status === 'approved' ? 'YES! 🎉' : r.status === 'wait' ? 'Wait a week ⏳' : 'Not this time 💭'}
        ${r.parentNote ? `<i>"${esc(r.parentNote)}"</i>` : ''} <button class="link" data-act="seen" data-id="${r.id}">OK</button></div>`));
      coolReady.forEach(r => banners.push(`<div class="banner info">🧊 Cool-down over for <b>${esc(r.item)}</b>. Do you still want it? <button class="btn small primary" data-act="open-ask">Decide</button></div>`));
      return `<header class="top">
          <div class="me"><span class="avatar">${p.avatar}</span><div><small>Hi,</small><b>${esc(p.nickname)}!</b></div></div>
          <div class="row"><button class="icon-btn" data-act="go" data-to="grownup" aria-label="Grown-up mode">🔒</button>
          <button class="icon-btn" data-act="go" data-to="settings" aria-label="Settings">⚙️</button></div></header>
        ${banners.join('')}
        <section class="pig-card">
          <button class="pig-btn" data-act="oink" aria-label="Tap Gullak">${G.piggy(mood.mood, 130)}</button>
          <div class="bubble">${esc(mood.msg)} ${G.speakBtn(mood.msg)}</div>
        </section>
        <section class="balance card">
          <small>You can spend</small>
          <div class="bal">${rs(bal)}</div>
          <button class="lens" data-act="unit" title="Tap to change">= ${u.text} <span class="erow">${G.emojiRow(u.n, u.e, 8)}</span> <span class="swap">🔄</span></button>
          ${G.totalInGoals() ? `<small class="muted">+ ${rs(G.totalInGoals())} safe in your dream jar${s.goals.filter(x => !x.boughtAt).length > 1 ? 's' : ''} 🔐</small>` : ''}
          <div class="row gap mt"><button class="btn good grow big" data-act="in">➕ I got money</button><button class="btn warm grow big" data-act="out">➖ I spent money</button></div>
        </section>
        <h3 class="section-t">Your 3 big questions</h3>
        <button class="q-card q1" data-act="go" data-to="money"><span class="q-e">💸</span><div><b>Where did my money go?</b>
          <small>${wk.count ? `This week: ${rs(wk.total)} spent = ${G.inUnits(wk.total, s.settings.unit === 'goal' ? 'samosa' : s.settings.unit).text}` : 'Nothing spent this week 🌟'}</small></div><span class="chev">›</span></button>
        <button class="q-card q2" data-act="go" data-to="goal"><span class="q-e">${g ? g.emoji : '🌈'}</span><div><b>${g ? `Saving for my ${esc(g.name)}` : 'How do I save for my dream?'}</b>
          ${g ? `${G.progress(G.goalPct(g))}<small>${G.goalPct(g)}% · ${G.daysToGoal(g) ? `about ${G.plural(G.daysToGoal(g), 'day')} to go` : 'Ready!'} ${G.streak() ? ` · 🔥${G.streak()}` : ''}</small>` : '<small>Pick a dream and watch it build up</small>'}</div><span class="chev">›</span></button>
        <button class="q-card q3" data-act="go" data-to="ask"><span class="q-e">🙋</span><div><b>Can I buy this, Mum?</b>
          <small>${pendingAsk ? `${G.plural(pendingAsk, 'ask')} waiting for a grown-up` : 'Ask a grown-up with one tap'}</small></div><span class="chev">›</span></button>
        <h3 class="section-t">More fun</h3>
        <div class="tiles">
          <button class="tile" data-act="go" data-to="report"><span>📊</span>Report card</button>
          <button class="tile" data-act="go" data-to="future"><span>🔮</span>Future Me</button>
          <button class="tile" data-act="go" data-to="chores"><span>🧹</span>Earn${choresOpen ? ` <i class="dot">${choresOpen}</i>` : ''}</button>
          <button class="tile" data-act="go" data-to="play"><span>🎪</span>Games</button>
          <button class="tile" data-act="go" data-to="badges"><span>🏅</span>Badges <i class="dot">${s.badges.length}</i></button>
          <button class="tile" data-act="go" data-to="settings"><span>⚙️</span>Settings</button>
        </div>`;
    },
    handlers: () => ({
      in: () => G.openTxn('in'), out: () => G.openTxn('out'), unit: () => G.cycleUnit(),
      'gift-feed': () => { const a = S().meta.pendingGift || 0; S().meta.pendingGift = 0; G.save(); G.render(); if (a) G.saveNudge(a); },
      'gift-ok': () => { S().meta.pendingGift = 0; G.save(); G.render(); },
      oink: () => {
        G.sound('coin');
        const tips = ['Oink! Save first, spend later. 🪙', 'Before you buy, ask: need or want? 🤔', 'Waiting one day before buying a want is a superpower. 🦸',
          'Every samosa you skip is a step towards your dream! 🥟', 'Earn extra by helping at home. 🧹', 'Money is like seeds: save some, watch it grow. 🌱'];
        const t = tips[(Math.random() * tips.length) | 0]; G.toast('🐷 ' + t); G.speak(t);
        const pig = G.$('.pig-btn'); pig.classList.remove('jump'); void pig.offsetWidth; pig.classList.add('jump');
      },
      payday: () => {
        const p = S().profile; S().meta.lastPayday = G.now();
        G.act.addTxn({ type: 'in', amount: p.pocketMoney, category: 'pocket', note: 'Pocket money' });
        G.sound('coin'); G.after(); G.render(); setTimeout(() => G.saveNudge(p.pocketMoney), 300);
      },
      'payday-skip': () => { S().meta.lastPayday = G.now() - (S().profile.frequency === 'monthly' ? 29 : 6) * G.DAY; G.save(); G.render(); },
      seen: (el) => { const r = S().requests.find(x => x.id === el.dataset.id); if (r) r.seen = true; G.save(); G.render(); },
      'open-ask': () => G.go('ask'),
      'reset-real': async () => { if (await G.confirm('Start your own Gullak?', 'This clears the sample data.', 'Yes, start fresh', 'Keep exploring')) { localStorage.clear(); G.S = G.fresh(); G.go('welcome'); } }
    })
  };

  /* =====================================================================
     Q1: Where did all my money go?
     ===================================================================== */
  let period = 'week';
  G.screens.money = {
    nav: 'money',
    render: () => {
      const s = S(); const b = G.spendBreakdown(period); const bal = G.balance();
      const unit = s.settings.unit; const g = G.activeGoal();
      const leftPct = bal + b.total > 0 ? Math.round(Math.max(0, bal) / (Math.max(0, bal) + b.total) * 100) : 100;
      const uSpent = G.inUnits(b.total, unit), uLeft = G.inUnits(bal, unit);
      const ins = G.insight(period);
      const topWant = b.rows.find(r => s.txns.some(t => t.type === 'out' && t.category === r.cat && t.needOrWant === 'want'));
      const half = topWant ? Math.round(topWant.amount / 2) : 0;
      const items = s.txns.filter(t => t.date >= G.periodFrom(period) && t.type !== 'goalSpend').sort((a, z) => z.date - a.date);
      const groups = {}; items.forEach(t => { const k = G.dayLabel(t.date); (groups[k] = groups[k] || []).push(t); });
      const row = (t) => {
        if (t.type === 'loanIn' || t.type === 'loanPay') {
          const inn = t.type === 'loanIn';
          return `<li class="tx"><span class="tx-e">🏦</span><div class="grow"><b>${inn ? 'Borrowed from Future Me' : 'Paid back Future Me'}</b><small>${inn ? 'an advance, not a gift!' : 'loan repayment'}</small></div>
            <span class="amt ${inn ? 'plus' : 'minus'}">${inn ? '+' : '−'}${rs(t.amount)}</span><span class="x"></span></li>`;
        }
        const isIn = t.type === 'in', toG = t.type === 'toGoal', fromG = t.type === 'fromGoal';
        const goal = s.goals.find(x => x.id === t.goalId);
        const icon = isIn ? (G.SOURCES[t.category] || G.SOURCES.other).e : toG || fromG ? (goal ? goal.emoji : '🎯') : (G.CATS[t.category] || G.CATS.other).e;
        const label = t.note || (isIn ? (G.SOURCES[t.category] || G.SOURCES.other).n : toG ? `Saved for ${goal ? goal.name : 'dream'}` : fromG ? `Took out of ${goal ? goal.name : 'dream'}` : (G.CATS[t.category] || G.CATS.other).n);
        const sign = isIn || fromG ? '+' : '−';
        const joy = G.JOY && t.joy != null && t.joy >= 0 ? ' · ' + G.JOY[t.joy].e : '';
        return `<li class="tx"><span class="tx-e">${icon}</span><div class="grow"><b>${esc(label)}</b>
          <small>${t.needOrWant ? (t.needOrWant === 'need' ? '🧩 need' : '✨ want') : toG ? '🔐 into dream jar' : ''}${joy}</small></div>
          <span class="amt ${isIn || fromG ? 'plus' : toG ? 'save' : 'minus'}">${sign}${rs(t.amount)}</span>
          <button class="x" data-act="del" data-id="${t.id}" aria-label="Delete">✕</button></li>`;
      };
      const wb = G.weekBars(6); const wmax = Math.max(1, ...wb.map(w => Math.max(w.spent, w.saved)));
      return `<header class="page-h"><button class="back" data-act="go" data-to="home" aria-label="Back">←</button><h1>💸 Where did my money go?</h1></header>
        <div class="tabs">${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, n]) => `<button class="tab ${period === k ? 'on' : ''}" data-act="period" data-v="${k}">${n}</button>`).join('')}</div>
        <section class="card split">
          <div class="jar-box">${G.jar(leftPct, '#3DDC97', 100)}<small>What's left</small></div>
          <div class="grow">
            <div class="kv"><span>💰 Got</span><b>${rs(b.income)}</b></div>
            <div class="kv"><span>💸 Spent</span><b class="minus">${rs(b.total)}</b></div>
            <div class="kv"><span>🔐 Saved</span><b class="save">${rs(b.saved)}</b></div>
            <div class="kv big"><span>🐷 Left to spend</span><b>${rs(bal)}</b></div>
          </div>
        </section>
        <section class="card lens-card">
          <div class="row between"><b>🔍 Money Lens</b><small class="muted">See money as things</small></div>
          <div class="chips">${G.allUnits().map(u => `<button class="chip ${u.id === unit ? 'on' : ''}" data-act="lens" data-v="${u.id}">${u.e} ${u.id === 'goal' ? 'my dream' : u.many}</button>`).join('')}
            <button class="chip" data-act="custom-unit">➕ my own</button></div>
          <div class="lens-out"><div><small>You spent</small><b>${uSpent.text}</b><div class="erow">${G.emojiRow(uSpent.n, uSpent.e, 20)}</div></div>
            <div><small>You still have</small><b>${uLeft.text}</b><div class="erow">${G.emojiRow(uLeft.n, uLeft.e, 20)}</div></div></div>
        </section>
        <section class="card insight"><span class="big">🕵️</span><p>${esc(ins)}</p>${G.speakBtn(ins)}</section>
        ${b.count ? `<section class="card"><h3>Where it went</h3>
          ${b.rows.map(r => { const c = G.CATS[r.cat] || G.CATS.other; const uu = G.inUnits(r.amount, unit === 'goal' ? 'samosa' : unit);
            return `<div class="cat-row"><span class="cat-e">${c.e}</span><div class="grow"><div class="row between"><b>${c.n}</b><b>${rs(r.amount)}</b></div>
              ${G.progress(r.amount / b.total * 100, 'thin')}<small class="muted">${Math.round(r.amount / b.total * 100)}% · ${uu.text}</small></div></div>`; }).join('')}
          <h3 class="mt">🧩 Needs vs ✨ Wants</h3>
          <div class="nw-bar"><div class="need" style="flex:${b.need || 0.0001}">${b.need ? '🧩 ' + rs(b.need) : ''}</div><div class="want" style="flex:${b.want || 0.0001}">${b.want ? '✨ ' + rs(b.want) : ''}</div></div>
          <small class="muted">${b.want > b.need ? 'More wants than needs. That\'s okay sometimes, just keep an eye on it! 👀' : 'Nice balance! Needs come first. 👍'}</small>
        </section>` : ''}
        ${topWant && g ? `<section class="card whatif"><h3>🤔 What if…</h3><p>…you spent <b>half</b> as much on ${G.CATS[topWant.cat].e} ${G.CATS[topWant.cat].n.toLowerCase()}?
          You'd keep <b>${rs(half)}</b> and get your ${esc(g.name)} ${g.emoji} <b>${G.plural(G.daysBack(half), 'day')} sooner</b>!</p></section>` : ''}
        ${!junior() ? `<section class="card"><h3>📈 Last 6 weeks</h3><div class="chart">${wb.map(w => `<div class="col-bar">
            <div class="bars"><i class="b-spent" style="height:${w.spent / wmax * 100}%" title="Spent ${rs(w.spent)}"></i><i class="b-saved" style="height:${Math.max(0, w.saved) / wmax * 100}%" title="Saved ${rs(w.saved)}"></i></div>
            <small>${G.dateStr(w.start)}</small></div>`).join('')}</div>
          <div class="legend"><span><i class="b-spent"></i>Spent</span><span><i class="b-saved"></i>Saved</span></div></section>` : ''}
        <section class="card"><div class="row between"><h3>📒 Money diary</h3>
          <div class="row gap"><button class="btn small good" data-act="in">➕</button><button class="btn small warm" data-act="out">➖</button></div></div>
          ${items.length ? Object.keys(groups).map(k => `<div class="day">${k}</div><ul class="tx-list">${groups[k].map(row).join('')}</ul>`).join('') : '<p class="muted center">Nothing here yet. Tap ➖ when you spend money.</p>'}
        </section>`;
    },
    handlers: () => ({
      period: (el) => { period = el.dataset.v; G.render(); },
      lens: (el) => { S().settings.unit = el.dataset.v; G.save(); G.sound('tap'); G.render(); },
      'custom-unit': () => G.openCustomUnit(),
      in: () => G.openTxn('in'), out: () => G.openTxn('out'),
      del: async (el) => {
        if (await G.confirm('Delete this?', 'Only delete it if it was a mistake.', 'Delete', 'Keep')) { G.act.deleteTxn(el.dataset.id); G.render(); }
      }
    })
  };

  G.openCustomUnit = () => {
    const cu = S().settings.customUnit || { e: '🍕', one: 'pizza slice', many: 'pizza slices', price: 60 };
    let price = cu.price;
    const m = G.modal({
      html: `<h2>➕ My own money unit</h2><p class="muted">What do YOU love to buy? Measure money in it!</p>
        <div class="emoji-row">${['🍕', '🧃', '🍔', '🍿', '🎈', '🍩', '🧁', '🃏', '🖍️', '🍭', '🥤', '🎯'].map(e => `<button class="emo ${e === cu.e ? 'on' : ''}" data-act="emo" data-v="${e}">${e}</button>`).join('')}</div>
        <input class="input" id="cu-one" maxlength="20" value="${esc(cu.one)}" placeholder="e.g. pizza slice" aria-label="Unit name">
        <div class="label">One costs</div>${G.keypadHTML([5, 10, 20, 50])}
        <button class="btn primary block big" data-act="ok">Use it!</button>`,
      handlers: {
        emo: (el) => { cu.e = el.dataset.v; G.$$('.emo', m.el).forEach(b => b.classList.toggle('on', b === el)); },
        ok: () => {
          const one = G.$('#cu-one', m.el).value.trim(); if (!one || !price) return G.toast('Give it a name and a price');
          S().settings.customUnit = { e: cu.e, one, many: /s$/.test(one) ? one : one + 's', price };
          S().settings.unit = 'custom'; G.save(); m.close(); G.render();
        }
      }
    });
    G.attachKeypad(m.el, { value: price, max: 5000, onChange: v => { price = v; } });
  };

  /* =====================================================================
     Q2: How do I save for that cycle?  (Dream screen)
     ===================================================================== */
  G.screens.goal = {
    nav: 'goal',
    render: () => {
      const s = S(); const g = G.activeGoal(); const live = s.goals.filter(x => !x.boughtAt); const bought = s.goals.filter(x => x.boughtAt);
      const maxLive = junior() ? 1 : 3;
      const shelf = bought.length ? `<section class="card"><h3>🏆 My trophy shelf</h3><div class="shelf">${bought.map(b => `<div class="trophy"><span>${b.emoji}</span><small>${esc(b.name)}<br>${G.dateStr(b.boughtAt)}</small></div>`).join('')}</div></section>` : '';
      if (!g) return `<header class="page-h"><button class="back" data-act="go" data-to="home">←</button><h1>🌈 My dream</h1></header>
        <section class="card center empty">${G.piggy('calm', 140)}<h2>What are you saving for?</h2>
          <p class="muted">Pick a dream and watch it appear, piece by piece, as you save.</p>
          <button class="btn primary big block" data-act="new">🌈 Pick a dream</button></section>${shelf}`;
      const saved = G.goalSaved(g.id), pct = G.goalPct(g), left = Math.max(0, g.target - saved);
      const days = G.daysToGoal(g), weekly = Math.round(G.dailySaving() * 7);
      const eta = new Date(G.now() + days * G.DAY).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
      const sooner = (extraPerDay) => {
        const d1 = days, d2 = left <= 0 ? 0 : Math.ceil(left / (G.dailySaving() + extraPerDay));
        return Math.max(0, d1 - d2);
      };
      const done = saved >= g.target;
      const ms = [25, 50, 75, 100];
      return `<header class="page-h"><button class="back" data-act="go" data-to="home">←</button><h1>${g.emoji} My dream</h1></header>
        ${live.length > 1 || live.length < maxLive ? `<div class="tabs">${live.map(x => `<button class="tab ${x.id === g.id ? 'on' : ''}" data-act="pick" data-id="${x.id}">${x.emoji} ${esc(x.name)}</button>`).join('')}
          ${live.length < maxLive ? '<button class="tab add" data-act="new">＋ New dream</button>' : ''}</div>` : ''}
        <section class="card center dream ${done ? 'done' : ''}">
          ${G.puzzle(g.emoji, pct)}
          <h2>${esc(g.name)}</h2>
          ${G.progress(pct, 'fat')}
          <div class="row between small"><span><b>${rs(saved)}</b> saved</span><span><b>${pct}%</b></span><span>${rs(g.target)}</span></div>
          <div class="milestones">${ms.map(m => `<span class="${pct >= m ? 'hit' : ''}">${pct >= m ? '⭐' : '☆'} ${m}%</span>`).join('')}</div>
          ${done ? `<div class="ready"><h3>🎉 You saved enough!</h3><p>Go buy it with a grown-up, then tap below.</p>
              <button class="btn primary big block" data-act="bought">🛍️ I bought my ${esc(g.name)}!</button></div>`
            : `<p class="eta">⏳ At your speed (about <b>${rs(weekly)}/week</b>) you'll get it in <b>${G.plural(days, 'day')}</b>, around <b>${eta}</b>.</p>`}
          <div class="row gap"><button class="btn primary grow big" data-act="feed">🪙 Add money</button>
            <button class="btn ghost" data-act="takeout">Take out</button></div>
          ${G.streak() ? `<p class="streak">🔥 ${G.plural(G.streak(), 'week')} saving streak!</p>` : '<p class="small muted">Save something every week to start a 🔥 streak.</p>'}
          <p class="small muted">🐷 Spendable money in your Gullak: ${rs(G.balance())}</p>
        </section>
        ${done ? '' : `<section class="card"><h3>⏱️ Dream Time Machine</h3><p class="muted small">Every rupee moves your dream in time.</p>
          <div class="tm-list">
            ${[['🍦', 'One ice cream', 40], ['🥟', 'One samosa', 20], ['🎮', 'Game coins', 100], ['🎬', 'A movie', 200]].map(([e, n, a]) =>
              `<div class="tm tm-back"><span>${e}</span><div class="grow"><b>${n} (${rs(a)})</b><small>pushes your ${esc(g.name)} back</small></div><b class="minus">⏪ ${G.plural(G.daysBack(a), 'day')}</b></div>`).join('')}
            ${[['🥟', 'Skip 1 samosa a day', 20], ['🧹', 'Do a ₹20 chore each day', 20], ['🍫', 'Skip 1 chocolate a day', 10]].map(([e, n, a]) =>
              `<div class="tm tm-fwd"><span>${e}</span><div class="grow"><b>${n}</b><small>gets your ${esc(g.name)} sooner</small></div><b class="plus">⏩ ${G.plural(sooner(a), 'day')}</b></div>`).join('')}
          </div></section>
          <section class="card"><h3>🧮 Try a price</h3><p class="small muted">Thinking of buying something? See what it does to your dream.</p>
            <div class="row gap"><input class="input grow" id="try-amt" type="number" inputmode="numeric" min="1" placeholder="₹ amount" aria-label="Try a price">
            <button class="btn soft" data-act="try">Check</button></div><div id="try-out" class="preview"></div></section>`}
        ${shelf}
        <p class="center"><button class="link danger" data-act="remove">Remove this dream</button></p>`;
    },
    handlers: () => ({
      new: () => G.openGoalCreate(),
      pick: (el) => { S().activeGoalId = el.dataset.id; G.save(); G.render(); },
      feed: () => G.openMove(G.activeGoal().id, 'to'),
      takeout: () => G.openMove(G.activeGoal().id, 'from'),
      try: () => {
        const a = Math.round(Number(G.$('#try-amt').value) || 0); const g = G.activeGoal(); const out = G.$('#try-out');
        if (a <= 0) { out.innerHTML = '<span class="muted">Type an amount first</span>'; return; }
        const u = G.inUnits(a, 'samosa');
        out.innerHTML = `${rs(a)} = ${u.text} 🥟<div class="delay">⏪ It would push your <b>${esc(g.name)}</b> back <b>${G.plural(G.daysBack(a), 'day')}</b>.</div>
          <button class="btn small soft mt" data-act="ask-it" data-a="${a}">🙋 Ask a grown-up about it</button>`;
      },
      'ask-it': (el) => { G.askPrefill = { price: Number(el.dataset.a) }; G.go('ask'); },
      bought: async () => {
        const g = G.activeGoal();
        if (await G.confirm(`You bought your ${esc(g.name)}? 🎉`, 'It goes on your trophy shelf forever!', 'Yes, I did!', 'Not yet')) {
          G.act.buyGoal(g.id); G.confetti(220); G.sound('win'); G.after(); G.render();
          G.toast(`🏆 ${esc(g.name)} added to your trophy shelf!`, 4000);
        }
      },
      remove: async () => {
        const g = G.activeGoal();
        if (await G.confirm('Remove this dream?', `Money inside (${rs(G.goalSaved(g.id))}) goes back to your Gullak.`, 'Remove', 'Keep it')) { G.act.deleteGoal(g.id); G.render(); }
      }
    })
  };
})(window.G);
