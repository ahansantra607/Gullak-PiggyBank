/* Gullak modes + Family mode with encrypted cloud sync and local migration support.
   Modes:   🧒 Individual (grown-up PIN set first, then the kid) · 👨‍👩‍👧 Family (choose family → choose user → PIN)
   Family:  any number of Supervisors (grown-ups) and Members (kids). Only Supervisors add people.
   Storage: on this device only. Family list = names/emojis + encrypted key wraps. All money data = AES-256-GCM ciphertext. */
(function (G) {
  const C = G.cr; const esc = G.esc, rs = G.rs;
  const IDX = 'gullak:families', MODE = 'gullak:mode', SESS = 'gullak:famsession';
  const DATA = (id) => 'gullak:famdata:' + id;
  const QUESTIONS = ['What is your favourite food?', 'What is your favourite fruit?', 'Which superhero would you most like to be?',
    'What was the first film you watched in a cinema?', 'What is your dream holiday place?', 'What is your favourite colour plus a number? (e.g. blue 7)',
    'Make up a secret word only you know'];
  const FAM_EMOJI = ['🏠', '🌳', '🦁', '🌈', '🚀', '🐘', '🌻', '⭐', '🦚', '🏏'];
  const back = (title, to) => `<header class="page-h"><button class="back" data-act="go" data-to="${to}" aria-label="Back">←</button><h1>${title}</h1></header>`;
  const backUsers = (title) => `<header class="page-h"><button class="back" data-act="go-users" aria-label="Back">←</button><h1>${title}</h1></header>`;
  const LAST = 'gullak:lastfam'; const famOf = (q) => getFam(q.f) || (G.FAM && G.FAM.meta) || getFam(localStorage.getItem(LAST));
  const goUsers = (q) => { const f = famOf(q || {}); G.go('fam-users', f ? { f: f.id } : undefined); };

  /* ---------- family index (device only) ---------- */
  const idx = () => { try { return JSON.parse(localStorage.getItem(IDX)) || { list: [] }; } catch (e) { return { list: [] }; } };
  const getFam = (id) => idx().list.find(f => f.id === id) || null;
  const putFam = (meta) => { const x = idx(); const i = x.list.findIndex(f => f.id === meta.id); if (i < 0) x.list.push(meta); else x.list[i] = meta; localStorage.setItem(IDX, JSON.stringify(x)); };
  const dropFam = (id) => { const x = idx(); x.list = x.list.filter(f => f.id !== id); localStorage.setItem(IDX, JSON.stringify(x)); localStorage.removeItem(DATA(id)); };

  G.mode = () => localStorage.getItem(MODE) || 'individual';
  G.FAM = null;
  const isSup = () => !!(G.FAM && G.FAM.role === 'supervisor');
  const isKid = () => !!(G.FAM && G.FAM.role === 'member');
  const meM = () => G.FAM ? G.FAM.meta.members.find(m => m.id === G.FAM.mid) : null;
  const memberOf = (meta, id) => meta.members.find(m => m.id === id);
  G.isFamilyKid = isKid; G.isSupervisor = isSup;

  G.normState = (k) => { const f = G.fresh(); k = k || {}; return Object.assign(f, k, { settings: Object.assign(f.settings, k.settings || {}), meta: Object.assign(f.meta, k.meta || {}) }); };

  /* ---------- encrypted save (serialised so writes never overlap) ---------- */
  let chain = Promise.resolve();
  G.famSave = () => {
    const F = G.FAM; if (!F) return chain;
    const snap = JSON.stringify(F.data); const id = F.meta.id;
    chain = chain.then(async () => localStorage.setItem(DATA(id), await C.encStr(F.fk, snap))).catch(e => console.error('famSave', e));
    return chain;
  };
  const save0 = G.save;
  G.save = () => {
    if (G.mode() === 'family') { // never write plaintext in family mode
      if (!G.FAM) return;
      if (isKid()) G.FAM.data.kids[G.FAM.mid] = G.S;
      G.famSave(); return;
    }
    save0();
  };

  /* ---------- modes ---------- */
  G.setMode = (mode) => {
    G.FAM = null; sessionStorage.removeItem(SESS); G.parentUnlocked = false;
    localStorage.setItem(MODE, mode);
    if (mode === 'family') { G.storeKey = 'gullak:none'; G.S = G.fresh(); }
    else { G.storeKey = 'gullak:v1'; G.S = G.load(); }
  };
  const hasMe = () => { try { const s = JSON.parse(localStorage.getItem('gullak:v1')); return !!(s && s.profile); } catch (e) { return false; } };
  /* Two modes. Data is kept in this browser only ("whoever opens it, their browser keeps it"). */
  const modesHTML = () => `<div class="modes">
      <button class="mode-card m-me" data-act="mode-me"><span>🧒</span><div><b>Individual</b><small>${hasMe() ? 'Continue my Gullak' : 'One Individual Gullak, securely synced to your cloud account.'}</small></div><i>›</i></button>
      <button class="mode-card m-fam" data-act="mode-fam"><span>👨‍👩‍👧</span><div><b>Family</b><small>Choose your family, pick who you are, enter your PIN. Supervisors approve asks.</small></div><i>›</i></button>
    </div>
    <p class="fine">🔒 No real money, no email, no phone, no real names. Cloud data is encrypted before upload. Keep your recovery code safe.</p>`;
  const modeHandlers = () => ({
    'mode-me': () => { G.setMode('individual'); if (G.S.profile) G.go('home'); else G.go('me-pin'); },
    'mode-fam': () => {
      if (!C.available) return G.toast('Family mode needs a secure page (https or localhost).');
      G.setMode('family'); G.go('fam-pick');
    }
  });

  /* Individual mode: the grown-up makes their PIN right at the beginning, before the kid sets up */
  const mp = { first: null, buf: '' };
  G.screens['me-pin'] = {
    bare: true,
    render: () => `${back('🔒 Grown-up PIN', 'modes')}
      <section class="card center pin">${G.piggy('calm', 110)}
        <h2>${mp.first ? 'Type it again to check' : 'Grown-ups first! Make a 4-digit PIN'}</h2>
        <p class="muted">This PIN opens <b>Grown-up mode</b>: approving "Can I buy this?", paying chores, loans and settings. Keep it secret from your kid 🤫</p>
        <div class="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < mp.buf.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="kp-grid pin-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button class="kp-key" data-act="mpin" data-k="${k}">${k}</button>` : '<span></span>').join('')}</div>
        <p class="fine">Your PIN protection syncs with your encrypted Gullak account.</p></section>`,
    handlers: () => ({
      mpin: (el) => {
        const k = el.dataset.k; G.sound('tap');
        if (k === '⌫') mp.buf = mp.buf.slice(0, -1); else if (mp.buf.length < 4) mp.buf += k;
        if (mp.buf.length === 4) {
          if (!mp.first) { mp.first = mp.buf; mp.buf = ''; }
          else if (mp.first === mp.buf) {
            G._pendingPin = G.hash(mp.buf); mp.first = null; mp.buf = ''; G.sound('coin');
            return G.go('me-rules');
          } else { mp.first = null; mp.buf = ''; G.sound('bad'); G.toast('The PINs didn\'t match. Try again.'); }
        }
        G.render({ keepScroll: true });
      }
    })
  };
  const meRules = {};
  G.screens['me-rules'] = {
    bare: true,
    render: () => (Object.keys(meRules).length < 5 && Object.assign(meRules, G.RULE_DEFAULTS, meRules), '') + `<header class="page-h"><h1>📋 Grown-up rules</h1></header><section class="card">
      <p class="muted">Set the house rules for your kid's Gullak before handing it over.</p>${rulesHTML(meRules)}
      <button class="btn primary block big" data-act="rules-ok">Save &amp; hand over to my kid →</button></section>`,
    handlers: () => ({ rule: ruleClick(meRules), 'rules-ok': () => { G._pendingRules = Object.assign({}, meRules); G.sound('coin'); G.toast('🔒 Grown-up rules saved. Now hand over to your kid!'); G.obStart(1); G.go('welcome'); } })
  };
  const applyPendingPin = () => {
    if (!G.S.profile) return;
    if (G._pendingPin) { G.S.pinHash = G._pendingPin; G._pendingPin = null; }
    if (G._pendingRules) { Object.assign(G.S.settings, G._pendingRules); G._pendingRules = null; }
    G.save();
  };

  G.screens.modes = {
    bare: true,
    render: () => `<section class="welcome">${G.piggy('happy', 140)}<h1 class="brand sm">Gullak</h1><p class="tag">How do you want to use Gullak?</p>${modesHTML()}</section>`,
    handlers: modeHandlers
  };

  /* Welcome step 0 shows the mode chooser instead of the two old buttons */
  (() => {
    const sc = G.screens.welcome; const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => r0(q).replace(/<button class="btn primary block big" data-act="next">Start my Gullak ✨<\/button>\s*<button class="btn soft block" data-act="sample">👀 Try it with sample data<\/button>\s*<p class="fine">[\s\S]*?<\/p>/, modesHTML());
    sc.handlers = (q) => {
      const h = h0(q); const f0 = h.finish, f1 = h['finish-skip'];
      return Object.assign(h, modeHandlers(), { finish: () => { f0(); applyPendingPin(); }, 'finish-skip': () => { f1(); applyPendingPin(); } });
    };
  })();

  /* ---------- create / unlock / lock ---------- */
  const makeMember = async (info, fkRaw, iter) => {
    const salt = C.salt();
    return Object.assign({ id: 'm' + G.uid(6).toLowerCase(), createdAt: G.now(), fail: 0, lockUntil: 0 }, info,
      { pin: undefined, salt, wrap: await C.wrapWithSecret(info.pin, salt, fkRaw, iter), pinLen: String(info.pin).length });
  };
  /* Grown-up rules asked at setup (Individual and Family). Kids' settings start from these. */
  G.RULE_DEFAULTS = { loanInterest: 0, matchPct: 0, coolHours: 24, coolMin: 200, reviewHours: 12 };
  const RULES = [
    { k: 'loanInterest', t: '🏦 Interest when they borrow from Future Me', o: [[0, 'None'], [5, '5%'], [10, '10%'], [20, '20%']] },
    { k: 'matchPct', t: '🤝 Your bonus when they save (savings match)', o: [[0, 'Off'], [5, '5%'], [10, '10%'], [25, '25%'], [50, '50%']] },
    { k: 'coolHours', t: '🧊 Cool-down wait for big wants', o: [[1 / 60, '1 min (demo)'], [1, '1 hour'], [24, '24 hours'], [48, '2 days']] },
    { k: 'coolMin', t: '🧊 Suggest cool-down for wants above', o: [[100, '₹100'], [200, '₹200'], [500, '₹500'], [1000, '₹1,000']] },
    { k: 'reviewHours', t: '😍 Ask "Was it worth it?" after', o: [[1 / 60, '1 min (demo)'], [3, '3 hours'], [12, '12 hours'], [24, '1 day']] }
  ];
  const rulesHTML = (st) => RULES.map(r => `<div class="label">${r.t}</div><div class="chips">${r.o.map(([v, n]) => `<button class="chip ${Math.abs(st[r.k] - v) < 1e-6 ? 'on' : ''}" data-act="rule" data-k="${r.k}" data-v="${v}">${n}</button>`).join('')}</div>`).join('')
    + '<p class="fine">You can change these any time in Grown-up mode.</p>';
  const ruleClick = (st) => (el) => { st[el.dataset.k] = Number(el.dataset.v); G.sound('tap'); G.render({ keepScroll: true }); };
  const kidState = (m, extra = {}) => {
    const s = G.fresh(); const t = G.now();
    Object.assign(s.settings, G.RULE_DEFAULTS, (G.FAM && G.FAM.data.defaults) || {});
    s.profile = { nickname: m.name, avatar: m.avatar, ageGroup: m.ageGroup || 'junior', pocketMoney: extra.pocketMoney || 0, frequency: extra.frequency || 'weekly', createdAt: t };
    s.meta.lastPayday = t; s.meta.lastOpen = t; s.meta.prevOpen = t; s.pinHash = 'family'; // supervisors replace the old shared PIN
    return s;
  };

  G.famCreate = async ({ famName, famEmoji, name, avatar, pin, qIds, answers }) => {
    const fkRaw = C.rand(32); const iter = C.ITER;
    const sup = await makeMember({ name, avatar, role: 'supervisor', pin }, fkRaw, iter);
    const code = C.recoveryCode(); const rcSalt = C.salt(); const qSalt = C.salt();
    const meta = {
      id: 'f' + G.uid(8).toLowerCase(), name: famName, emoji: famEmoji, createdAt: G.now(), iter, members: [sup],
      rc: { salt: rcSalt, wrap: await C.wrapWithSecret(C.normCode(code), rcSalt, fkRaw, iter) },
      q: { ids: qIds, salt: qSalt, wrap: await C.wrapWithSecret(answers.map(C.norm).join('|'), qSalt, fkRaw, iter) }
    };
    putFam(meta);
    G.FAM = { meta, fk: await C.aesKey(fkRaw), fkRaw, data: { v: 1, kids: {}, sups: { [sup.id]: {} }, createdAt: G.now() }, mid: sup.id, role: 'supervisor' };
    await G.famSave(); remember(); enterAs(sup);
    return code;
  };

  const remember = () => sessionStorage.setItem(SESS, JSON.stringify({ famId: G.FAM.meta.id, mid: G.FAM.mid, fk: C.b64(G.FAM.fkRaw) }));
  const openFamily = async (meta, fkRaw, mid) => {
    const fk = await C.aesKey(fkRaw); const ct = localStorage.getItem(DATA(meta.id));
    const data = ct ? JSON.parse(await C.decStr(fk, ct)) : { v: 1, kids: {}, sups: {} };
    data.kids = data.kids || {}; data.sups = data.sups || {};
    const m = memberOf(meta, mid);
    G.FAM = { meta, fk, fkRaw, data, mid, role: m.role }; localStorage.setItem(LAST, meta.id);
    remember(); enterAs(m);
  };
  const enterAs = (m) => {
    G.parentUnlocked = false; G.FAM.viewKid = null;
    if (m.role === 'member') {
      const k = G.normState(G.FAM.data.kids[m.id] || kidState(m));
      k.profile.nickname = m.name; k.profile.avatar = m.avatar;
      G.FAM.data.kids[m.id] = k; G.S = k;
      k.meta.prevOpen = k.meta.lastOpen || G.now(); k.meta.lastOpen = G.now();
      G.checkBadges(); G.famSave();
    } else G.S = G.fresh();
  };
  G.famUnlock = async (famId, mid, pin) => {
    const meta = getFam(famId); const m = meta && memberOf(meta, mid);
    if (!m) throw { code: 'missing' };
    if (m.lockUntil && m.lockUntil > G.now()) throw { code: 'locked', until: m.lockUntil };
    let fkRaw;
    try { fkRaw = await C.unwrapWithSecret(pin, m.salt, m.wrap, meta.iter); }
    catch (e) {
      m.fail = (m.fail || 0) + 1; if (m.fail >= 5) m.lockUntil = G.now() + 60e3 * Math.pow(2, Math.min(6, m.fail - 5));
      putFam(meta); throw { code: m.lockUntil > G.now() ? 'locked' : 'wrong', left: Math.max(0, 5 - m.fail), until: m.lockUntil };
    }
    m.fail = 0; m.lockUntil = 0; putFam(meta);
    await openFamily(meta, fkRaw, mid);
  };
  G.famLock = (to = 'fam-users') => {
    const id = G.FAM && G.FAM.meta.id;
    G.famSave(); G.FAM = null; sessionStorage.removeItem(SESS); G.parentUnlocked = false; G.S = G.fresh();
    G.go(to, id ? { f: id } : undefined);
  };
  const withKid = (mid, fn) => { const prev = G.S; G.S = G.FAM.data.kids[mid]; try { return fn(G.S); } finally { G.famSave(); G.S = prev; } };

  /* boot: restore an unlocked family for this browser tab only (closing the tab locks it) */
  G.bootReady = (async () => {
    const mode = G.mode();
    if (mode === 'sample') { localStorage.setItem(MODE, 'individual'); G.storeKey = 'gullak:v1'; G.S = G.load(); } // old Sample mode → Individual
    if (mode !== 'family') return;
    G.storeKey = 'gullak:none'; G.S = G.fresh();
    let s = null; try { s = JSON.parse(sessionStorage.getItem(SESS)); } catch (e) { s = null; }
    const meta = s && getFam(s.famId);
    if (meta && memberOf(meta, s.mid) && C.available) {
      try { await openFamily(meta, C.unb64(s.fk), s.mid); } catch (e) { sessionStorage.removeItem(SESS); G.FAM = null; G.S = G.fresh(); }
    }
  })();

  /* ---------- routing rules ---------- */
  const FAM_FREE = ['modes', 'fam-pick', 'fam-create', 'fam-users', 'fam-pin', 'fam-recover'];
  G.FREE_ROUTES = (G.FREE_ROUTES || ['welcome', 'parent', 'reply']).concat(['me-pin', 'me-rules']);
  G.FREE_ROUTES = (G.FREE_ROUTES || ['welcome', 'parent', 'reply']).concat(FAM_FREE, ['sup']);
  G.routeGuard = (name, q = {}) => {
    const guScreen = name === 'grownup' || (name === 'report' && !!q.gu);
    G.inGrownup = guScreen; // hides the kid's bottom menu inside Grown-up mode
    if (G.mode() !== 'family') {
      // Individual mode: leaving Grown-up mode by ANY route (back, links, URL) locks it again
      if (G.parentUnlocked && !guScreen) { G.parentUnlocked = false; setTimeout(() => G.toast('🔒 Grown-up mode locked'), 60); }
      return ['sup', 'fam-users', 'fam-pin', 'fam-recover'].includes(name) ? 'fam-pick' : null;
    }
    if (!G.FAM) return FAM_FREE.concat(['parent', 'reply']).includes(name) ? null : 'fam-pick';
    if (isSup()) {
      const ok = ['sup', 'parent', 'reply', 'modes'];
      if (name === 'fam-create' && cr.code) return null; // show the new family's recovery code first
      if (G.FAM.viewKid) ok.push('grownup', 'report');
      return ok.includes(name) ? null : 'sup';
    }
    if (name === 'grownup') return 'fam-users';            // kids switch user to a supervisor instead of a shared PIN
    if (['sup', 'fam-create', 'fam-pick', 'welcome'].includes(name)) return 'home';
    return null;
  };
  G.hideNav = () => isSup() || !!G.inGrownup;

  /* ---------- screens: choose family ---------- */
  G.screens['fam-pick'] = {
    bare: true,
    render: () => {
      const list = idx().list;
      return `${back('👨‍👩‍👧 Choose your family', 'modes')}
        ${list.length ? `<div class="fam-list">${list.map(f => `<button class="fam-tile" data-act="pick" data-id="${f.id}"><span>${esc(f.emoji)}</span><div><b>${esc(f.name)}</b>
          <small>${f.members.map(m => esc(m.avatar)).join(' ')} · ${G.plural(f.members.length, 'member')}</small></div><i>›</i></button>`).join('')}</div>`
          : `<section class="card center">${G.piggy('calm', 110)}<p>No cloud families found yet.</p></section>`}
        <button class="btn primary block big" data-act="go" data-to="fam-create">➕ Create a new family</button>
        <label class="btn soft block file-btn">📂 Open a family backup file<input type="file" id="fam-import" accept=".gullak,application/json,.json" hidden></label>
        <p class="fine">🔐 Family details and money diaries are encrypted before syncing to Gullak Cloud.</p>`;
    },
    after: (root) => {
      const inp = G.$('#fam-import', root);
      inp.addEventListener('change', () => {
        const f = inp.files[0]; if (!f) return; const fr = new FileReader();
        fr.onload = async () => {
          const importFamily = async d => {
            if (!d || d.gullakFamily !== 1 || !d.meta || !Array.isArray(d.meta.members) || typeof d.data !== 'string') {
              throw new Error('This is not a valid Gullak family backup.');
            }
            if (getFam(d.meta.id) && !(await G.confirm('Replace this family?', `"${esc(d.meta.name)}" is already on this device. Replace it with the backup?`, 'Replace', 'Cancel'))) return;
            putFam(d.meta); localStorage.setItem(DATA(d.meta.id), d.data);
            G.toast(`📂 ${esc(d.meta.name)} family opened!`); G.render();
          };
          try {
            const parsed = JSON.parse(fr.result);
            if (parsed && parsed.format === 'gullak-encrypted-backup') {
              const modal = G.modal({
                html: '<h2>🔐 Unlock family backup</h2><p class="muted small">Enter the separate backup passphrase used when exporting this file.</p><input class="input" id="family-backup-pass" type="password" maxlength="256" autocomplete="off" placeholder="Backup passphrase"><button class="btn primary block mt" data-act="unlock-family-backup">Unlock backup</button>',
                handlers: {
                  'unlock-family-backup': async button => {
                    const pass = G.$('#family-backup-pass', modal.el).value;
                    if (pass.length < 10) return G.toast('Enter the backup passphrase.');
                    button.disabled = true; button.textContent = '🔐 Unlocking…';
                    try {
                      const d = await G.cloudBackup.decode(String(fr.result), pass);
                      await importFamily(d); modal.close();
                    } catch (error) {
                      button.disabled = false; button.textContent = 'Unlock backup';
                      G.toast(error.message || 'Could not unlock this family backup.');
                    }
                  }
                }
              });
            } else if (parsed && parsed.gullakFamily === 1) {
              if (!(await G.confirm('Import older family backup?', 'This older backup format does not protect family metadata with a separate backup passphrase. Import it only if you trust the file.', 'Import older backup', 'Cancel'))) return;
              await importFamily(parsed);
            } else {
              throw new Error('Unsupported family backup.');
            }
          } catch (e) { G.toast(e.message || 'That is not a Gullak family file 😕'); }
        };
        fr.readAsText(f);
      });
    },
    handlers: () => ({ pick: (el) => { if (G.mode() !== 'family') G.setMode('family'); G.go('fam-users', { f: el.dataset.id }); } })
  };

  /* ---------- choose user ---------- */
  G.screens['fam-users'] = {
    bare: true,
    render: (q) => {
      const f = famOf(q); if (!f) return `${back('Family', 'fam-pick')}<p class="muted center">Family not found.</p>`;
      const account = G.cloudAccount && G.cloudAccount.user;
      const visibleMembers = f.cloudId && account ? f.members.filter(m => m.userId === account.user_id) : f.members;
      if (f.cloudId && account && !visibleMembers.length) return `${back('Family', 'fam-pick')}<section class="card center"><p>This Gullak account has not been linked to a member of this family.</p><p class="small muted">Ask a supervisor to add your account username.</p></section>`;
      const sups = visibleMembers.filter(m => m.role === 'supervisor'), kids = visibleMembers.filter(m => m.role !== 'supervisor');
      const tile = (m) => `<button class="member-tile ${m.role}" data-act="who" data-m="${m.id}"><span class="av-big">${esc(m.avatar)}</span><b>${esc(m.name)}</b>
        <small>${m.role === 'supervisor' ? '🛡️ Supervisor' : '🧒 Kid'}</small>${m.lockUntil > G.now() ? '<small class="minus">🔒 locked</small>' : ''}</button>`;
      return `${back(`${esc(f.emoji)} ${esc(f.name)}`, 'fam-pick')}
        <h2 class="center">Who's using Gullak?</h2>
        ${kids.length ? `<div class="label">Kids</div><div class="member-grid">${kids.map(tile).join('')}</div>` : ''}
        <div class="label">Supervisors (grown-ups)</div><div class="member-grid">${sups.map(tile).join('')}</div>
        <p class="fine">New here? Only a supervisor can add people. Ask them to log in and tap "Add member".</p>`;
    },
    handlers: (q) => ({ who: (el) => G.go('fam-pin', { f: famOf(q).id, m: el.dataset.m }) })
  };

  /* ---------- PIN ---------- */
  let pinBuf = '', pinMsg = '', busy = false;
  G.screens['fam-pin'] = {
    bare: true,
    render: (q) => {
      const f = getFam(q.f); const m = f && memberOf(f, q.m);
      if (!m) return `${back('PIN', 'fam-pick')}<p class="muted center">Not found.</p>`;
      const locked = m.lockUntil > G.now();
      return `${backUsers(`${esc(f.emoji)} ${esc(f.name)}`)}
        <section class="card center pin"><span class="av-huge">${esc(m.avatar)}</span><h2>Hi ${esc(m.name)}!</h2>
          <p class="muted">${locked ? `Too many tries. Wait until ${new Date(m.lockUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` : busy ? '🔐 Unlocking…' : `Enter your ${m.pinLen}-digit PIN`}</p>
          <div class="pin-dots ${pinMsg ? 'shake' : ''}">${Array.from({ length: m.pinLen }, (_, i) => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
          ${pinMsg ? `<p class="minus small">${esc(pinMsg)}</p>` : ''}
          <div class="kp-grid pin-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button class="kp-key" data-act="fpin" data-k="${k}" ${locked || busy ? 'disabled' : ''}>${k}</button>` : '<span></span>').join('')}</div>
          <button class="link mt" data-act="forgot">Forgot PIN?</button></section>`;
    },
    handlers: (q) => ({
      fpin: async (el) => {
        if (busy) return;
        const f = getFam(q.f); const m = memberOf(f, q.m); const k = el.dataset.k; G.sound('tap'); pinMsg = '';
        if (k === '⌫') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < m.pinLen) pinBuf += k;
        if (pinBuf.length < m.pinLen) return G.render({ keepScroll: true });
        busy = true; G.render({ keepScroll: true });
        try {
          await G.famUnlock(q.f, q.m, pinBuf); pinBuf = ''; busy = false; G.sound('coin');
          G.go(isSup() ? 'sup' : 'home');
        } catch (e) {
          busy = false; pinBuf = ''; G.sound('bad');
          pinMsg = e.code === 'locked' ? 'Locked for a little while. Ask a supervisor if you forgot.' : `Wrong PIN. ${e.left ? e.left + ' tries left.' : ''}`;
          G.render({ keepScroll: true });
        }
      },
      forgot: () => { pinBuf = ''; pinMsg = ''; G.go('fam-recover', { f: q.f, m: q.m }); },
      'go-users': () => { pinBuf = ''; pinMsg = ''; goUsers(q); }
    })
  };

  /* ---------- recovery ---------- */
  const rec = { tab: 'code', fkRaw: null, busy: false, key: '' };
  G.screens['fam-recover'] = {
    bare: true,
    render: (q) => {
      const f = getFam(q.f); const m = f && memberOf(f, q.m); if (!m) return `${back('Recover', 'fam-pick')}`;
      
      // Reset verification state if arriving fresh from another screen or switching member/family
      if (G._last !== 'fam-recover' || rec.key !== q.f + q.m) {
        Object.assign(rec, { tab: 'code', fkRaw: null, busy: false, key: q.f + q.m });
      }
      
      // Use explicit back() pointing directly to fam-pick or fam-users with the family ID
      if (m.role !== 'supervisor') return `${back('Forgot PIN', 'fam-pick')}
        <section class="card center">${G.piggy('calm', 110)}<h2>No worries, ${esc(m.name)}!</h2>
        <p>Ask a <b>supervisor</b> in your family to log in and tap <b>🔑 Reset PIN</b> next to your name.</p>
        <button class="btn primary block" data-act="go-users">OK</button></section>`;
        
      if (rec.fkRaw) return `${back('New PIN', 'fam-pick')}
        <section class="card"><h2>✅ Verified! Choose a new PIN for ${esc(m.name)}</h2>
        <input class="input big" id="np1" type="password" inputmode="numeric" maxlength="6" placeholder="New PIN (4–6 digits)">
        <input class="input big" id="np2" type="password" inputmode="numeric" maxlength="6" placeholder="Type it again">
        <button class="btn primary block big" data-act="setpin" ${rec.busy ? 'disabled' : ''}>${rec.busy ? '🔐 Saving…' : 'Save new PIN'}</button></section>`;
        
      return `${back('Forgot PIN', 'fam-pick')}
        <section class="card"><h2>🔑 Recover ${esc(m.name)}'s PIN</h2>
        <div class="tabs"><button class="tab ${rec.tab === 'code' ? 'on' : ''}" data-act="rtab" data-v="code">Recovery code</button><button class="tab ${rec.tab === 'q' ? 'on' : ''}" data-act="rtab" data-v="q">Security questions</button></div>
        ${rec.tab === 'code' ? `<p class="muted small">The family recovery code you saved when the family was created (GULL-XXXX-…).</p>
          <input class="input big" id="rc" maxlength="30" placeholder="GULL-XXXX-XXXX-XXXX-XXXX" autocomplete="off">`
          : f.q.ids.map((qi, i) => `<div class="label">${esc(QUESTIONS[qi])}</div><input class="input" id="ra${i}" maxlength="40" autocomplete="off">`).join('')}
        <button class="btn primary block big" data-act="verify" ${rec.busy ? 'disabled' : ''}>${rec.busy ? '🔐 Checking…' : 'Check'}</button>
        <p class="fine">Another supervisor can also reset your PIN from their dashboard.</p></section>`;
    },
    handlers: (q) => ({
      'go-users': () => {
        Object.assign(rec, { tab: 'code', fkRaw: null, busy: false, key: '', _rc: '', _ans: [] });
        G.go('fam-users', { f: q.f });
      },
      rtab: (el) => { rec.tab = el.dataset.v; G.render(); },
      verify: async () => {
        const f = getFam(q.f); const rcIn = (G.$('#rc') || {}).value || rec._rc || ''; const ans = G.$$('[id^=ra]').map(i => i.value);
        rec.busy = true; G.render();
        try {
          if (rec.tab === 'code') rec.fkRaw = await C.unwrapWithSecret(C.normCode(rcIn), f.rc.salt, f.rc.wrap, f.iter);
          else rec.fkRaw = await C.unwrapWithSecret(ans.map(C.norm).join('|'), f.q.salt, f.q.wrap, f.iter);
          G.sound('coin');
        } catch (e) { G.sound('bad'); G.toast('That doesn\'t match. Check spelling and try again.'); }
        rec.busy = false; G.render();
      },
      setpin: async () => {
        const a = G.$('#np1').value, b = G.$('#np2').value;
        if (!/^\d{4,6}$/.test(a)) return G.toast('PIN must be 4 to 6 digits');
        if (a !== b) return G.toast('The two PINs don\'t match');
        rec.busy = true; G.render();
        const f = getFam(q.f); const m = memberOf(f, q.m);
        m.salt = C.salt(); m.wrap = await C.wrapWithSecret(a, m.salt, rec.fkRaw, f.iter); m.pinLen = a.length; m.fail = 0; m.lockUntil = 0;
        putFam(f); const fk = rec.fkRaw; Object.assign(rec, { fkRaw: null, busy: false, key: '' });
        await openFamily(f, fk, m.id); G.toast('🔑 New PIN saved. Welcome back!'); G.go('sup');
      }
    }),
    after: () => { // keep typed values across the "Checking…" re-render
      const rc = G.$('#rc'); if (rc) rc.addEventListener('input', () => { rec._rc = rc.value; });
      const ins = G.$$('[id^=ra]'); if (ins.length) { rec._ans = ins.map(i => i.value); ins.forEach((i, n) => i.addEventListener('input', () => { rec._ans[n] = i.value; })); }
    }
  };

  /* ---------- create family wizard ---------- */
  const cr = { step: 1, famName: '', famEmoji: '🏠', name: '', avatar: '🧑', pin: '', q: [0, 2], a: ['', ''], code: '', busy: false, saved: false, rules: Object.assign({}, G.RULE_DEFAULTS) };
  G.screens['fam-create'] = {
    bare: true,
    render: () => {
      const dots = `<div class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= cr.step ? 'on' : ''}"></i>`).join('')}</div>`;
      if (cr.step === 1) return `${back('➕ New family', 'fam-pick')}${dots}<section class="card">
        <div class="label">Family name</div><input class="input big" id="c-fam" maxlength="24" placeholder="e.g. The Rockets" value="${esc(cr.famName)}">
        <div class="emoji-row">${FAM_EMOJI.map(e => `<button class="emo ${e === cr.famEmoji ? 'on' : ''}" data-act="femo" data-v="${e}">${e}</button>`).join('')}</div>
        <p class="hint">🙈 A fun name, not your surname.</p>
        <div class="label">You'll be the first supervisor. What should kids call you?</div>
        <div class="chips">${['Mum', 'Dad', 'Nani', 'Nana', 'Dadi', 'Dada', 'Aunty', 'Uncle', 'Didi', 'Bhaiya'].map(n => `<button class="chip ${cr.name === n ? 'on' : ''}" data-act="cname" data-v="${n}">${n}</button>`).join('')}</div>
        <input class="input" id="c-name" maxlength="14" placeholder="…or type a nickname" value="${esc(cr.name)}">
        <div class="avatar-grid sm">${['🧑', '👩', '👨', '👵', '👴', '🧔', '👩‍🦱', '🦸', '🦁', '🐘', '🌟', '🛡️'].map(a => `<button class="av ${a === cr.avatar ? 'on' : ''}" data-act="cav" data-v="${a}">${a}</button>`).join('')}</div>
        <button class="btn primary block big" data-act="c1">Next →</button></section>`;
      if (cr.step === 2) return `${back('➕ New family', 'fam-pick')}${dots}<section class="card">
        <h2>🔢 Your supervisor PIN</h2><p class="muted small">4–6 digits. Tip: grown-ups should use 6 digits, kids can't guess it as easily.</p>
        <input class="input big" id="c-p1" type="password" inputmode="numeric" maxlength="6" placeholder="PIN">
        <input class="input big" id="c-p2" type="password" inputmode="numeric" maxlength="6" placeholder="Type it again">
        <button class="btn primary block big" data-act="c2">Next →</button><button class="btn ghost block" data-act="cback">← Back</button></section>`;
      if (cr.step === 3) return `${back('➕ New family', 'fam-pick')}${dots}<section class="card"><h2>📋 Family rules</h2>
        <p class="muted small">Default rules for every kid you add. You can change them per kid later.</p>${rulesHTML(cr.rules)}
        <button class="btn primary block big" data-act="c-rules">Next →</button><button class="btn ghost block" data-act="cback">← Back</button></section>`;
      if (cr.step === 4) return `${back('➕ New family', 'fam-pick')}${dots}<section class="card">
        <h2>🛟 Security questions</h2><p class="muted small">If every supervisor forgets their PIN, these unlock the family. No school, address or real names, just fun answers.</p>
        ${[0, 1].map(i => `<select class="input" id="c-q${i}" aria-label="Question ${i + 1}">${QUESTIONS.map((t, n) => `<option value="${n}" ${cr.q[i] === n ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <input class="input" id="c-a${i}" maxlength="40" placeholder="Your answer" value="${esc(cr.a[i])}" autocomplete="off">`).join('')}
        <button class="btn primary block big" data-act="c3" ${cr.busy ? 'disabled' : ''}>${cr.busy ? '🔐 Locking your family vault…' : 'Create family 🎉'}</button>
        <button class="btn ghost block" data-act="cback">← Back</button></section>`;
      return `${back('🎉 Family created', 'sup')}${dots}<section class="card center">
        <h2>🛟 Your Family Recovery Code</h2><p>Write this down and keep it safe (not in the app!). It unlocks the family if everyone forgets their PIN.</p>
        <div class="code big-code">${esc(cr.code)}</div>
        <div class="row gap"><button class="btn soft grow" data-act="ccopy">📋 Copy</button><button class="btn soft grow" data-act="csave">💾 Save as file</button></div>
        <label class="toggle"><input type="checkbox" id="c-ok" ${cr.saved ? 'checked' : ''}> I saved my recovery code</label>
        <button class="btn primary block big" data-act="cdone">Go to my family →</button></section>`;
    },
    after: (root) => {
      const bind = (id, k) => { const el = G.$(id, root); if (el) el.addEventListener('input', () => { cr[k] = el.value; }); };
      bind('#c-fam', 'famName'); bind('#c-name', 'name');
      ['#c-p1', '#c-p2'].forEach(sel => {
        const pin = G.$(sel, root);
        if (pin) {
          pin.addEventListener('beforeinput', e => { if (e.data && /\\D/.test(e.data)) e.preventDefault(); });
          pin.addEventListener('input', () => { pin.value = pin.value.replace(/\\D/g, '').slice(0, 6); });
        }
      });
      [0, 1].forEach(i => { const s = G.$('#c-q' + i, root), a = G.$('#c-a' + i, root); if (s) s.addEventListener('change', () => { cr.q[i] = +s.value; }); if (a) a.addEventListener('input', () => { cr.a[i] = a.value; }); });
      const ok = G.$('#c-ok', root); if (ok) ok.addEventListener('change', () => { cr.saved = ok.checked; });
    },
    handlers: () => ({
      femo: (el) => { cr.famEmoji = el.dataset.v; G.render({ keepScroll: true }); },
      cname: (el) => { cr.name = el.dataset.v; G.render({ keepScroll: true }); },
      cav: (el) => { cr.avatar = el.dataset.v; G.render({ keepScroll: true }); },
      cback: () => { cr.step = Math.max(1, cr.step - 1); G.render(); },
      rule: ruleClick(cr.rules),
      'c-rules': () => { cr.step = 4; G.render(); },
      c1: () => { if (!cr.famName.trim()) return G.toast('Give your family a name'); if (!cr.name.trim()) return G.toast('What should kids call you?'); cr.step = 2; G.render(); },
      c2: () => {
        const a = G.$('#c-p1').value, b = G.$('#c-p2').value;
        if (!/^\d{4,6}$/.test(a)) return G.toast('PIN must be 4 to 6 digits'); if (a !== b) return G.toast('The two PINs don\'t match');
        cr.pin = a; cr.step = 3; G.render();
      },
      c3: async () => {
        if (cr.q[0] === cr.q[1]) return G.toast('Pick two different questions');
        if (cr.a.some(a => C.norm(a).length < 2)) return G.toast('Answer both questions');
        cr.busy = true; G.render();
        try {
          if (G.mode() !== 'family') G.setMode('family');
          cr.code = await G.famCreate({ famName: cr.famName.trim(), famEmoji: cr.famEmoji, name: cr.name.trim(), avatar: cr.avatar, pin: cr.pin, qIds: cr.q.slice(), answers: cr.a.slice() });
          G.FAM.data.defaults = Object.assign({}, cr.rules); await G.famSave();
          cr.pin = ''; cr.a = ['', '']; cr.step = 5; G.sound('win'); G.confetti();
        } catch (e) { console.error(e); G.toast(e.message || 'Something went wrong creating the family 😕'); }
        cr.busy = false; G.render();
      },
      ccopy: () => G.copy(cr.code),
      csave: () => download(`gullak-recovery-code.txt`, `Gullak family "${cr.famName}" recovery code:\n${cr.code}\n\nKeep this safe. It can unlock your family if everyone forgets their PIN.`, 'text/plain'),
      cdone: () => { if (!cr.saved) return G.toast('Please save the code first, then tick the box ✅'); Object.assign(cr, { step: 1, famName: '', name: '', code: '', saved: false, rules: Object.assign({}, G.RULE_DEFAULTS) }); G.go('sup'); }
    })
  };

  const download = (name, text, type) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ---------- supervisor home ---------- */
  const decideLbl = { approved: '✅ Yes!', half: '🤝 Yes, if you pay half', wait: '⏳ Wait a week', declined: '💭 Not this time' };
  G.screens.sup = {
    bare: true,
    render: () => {
      const F = G.FAM; G.FAM.viewKid = null; G.parentUnlocked = false; G.S = G.fresh();
      const me = meM(); const kids = F.meta.members.filter(m => m.role !== 'supervisor');
      const asks = [];
      kids.forEach(k => { const ks = F.data.kids[k.id]; if (ks) ks.requests.filter(r => r.status === 'pending').forEach(r => asks.push({ k, ks, r })); });
      asks.sort((a, b) => b.r.createdAt - a.r.createdAt);
      const names = (ids) => (ids || []).map(id => { const m = memberOf(F.meta, id); return m ? m.name : null; }).filter(Boolean).join(', ');
      return `<header class="top"><div class="me"><span class="avatar">${esc(me.avatar)}</span><div><small>${esc(F.meta.emoji)} ${esc(F.meta.name)}</small><b>Hi, ${esc(me.name)}!</b></div></div>
          <div class="row"><button class="icon-btn" data-act="switch" aria-label="Switch user">👥</button><button class="icon-btn" data-act="lock" aria-label="Lock">🔒</button></div></header>
        <p class="sup-tag">🛡️ Supervisor</p>
        <section class="card"><h3>🙋 Asks waiting (${asks.length})</h3>
          ${asks.length ? asks.map(({ k, ks, r }) => { const im = G.impact(r.price, r.kidPays, ks); return `<div class="req-p">
            <div class="row gap"><span class="req-e">${r.emoji}</span><div class="grow"><b>${esc(k.avatar)} ${esc(k.name)}: ${esc(r.item)}</b> · ${rs(r.price)}<br>
              <small>${r.needOrWant === 'need' ? '🧩 Need' : '✨ Want'}${r.reasons && r.reasons.length ? ' · ' + r.reasons.map(esc).join(', ') : ''}${r.sentTo && r.sentTo.length ? ` · asked ${esc(names(r.sentTo))}` : ''}</small>
              ${r.why ? `<small class="note">"${esc(r.why)}"</small>` : ''}</div></div>
            <div class="impact"><div class="kv"><span>🐷 Has</span><b>${rs(im.bal)}</b></div><div class="kv"><span>🧒 Pays</span><b>${rs(r.kidPays)}</b></div>
              <div class="kv"><span>🧑 You pay</span><b>${rs(im.parentPays)}</b></div><div class="kv"><span>💰 Left after</span><b class="${im.after < 0 ? 'minus' : ''}">${rs(im.after)}</b></div>
              ${im.goal ? `<div class="delay">⏪ ${im.goal.emoji} ${esc(im.goal.name)} moves back <b>${G.plural(im.daysBack, 'day')}</b></div>` : ''}</div>
            <input class="input" id="sn-${k.id}-${r.id}" maxlength="80" placeholder="Note for ${esc(k.name)} (optional)">
            ${G.decButtons(r.price, r.kidPays, v => `data-act="sdecide" data-k="${k.id}" data-id="${r.id}" data-v="${v}"`)}</div>`; }).join('')
            : '<p class="muted">Nothing to decide right now. 👍</p>'}</section>
        <section class="card"><h3>🧒 Kids</h3>
          ${kids.length ? kids.map(k => { const ks = F.data.kids[k.id]; if (!ks) return ''; const g = G.activeGoal(ks); const rep = G.report(ks);
            const todo = ks.chores.filter(c => c.status === 'done').length + (ks.loans || []).filter(l => l.status === 'pending').length;
            return `<div class="kid-row"><span class="av-mid">${esc(k.avatar)}</span><div class="grow"><b>${esc(k.name)}</b>
              <small>🐷 ${rs(G.balance(ks))}${g ? ` · ${g.emoji} ${G.goalPct(g, ks)}%` : ''} · week ${'★'.repeat(rep.stars)}${todo ? ` · <span class="minus">${todo} to check</span>` : ''}</small></div>
              <button class="btn small primary" data-act="open-kid" data-k="${k.id}">Open</button></div>`; }).join('')
            : '<p class="muted">No kids yet. Add one below!</p>'}</section>
        <section class="card"><h3>👥 Family members</h3>
          ${F.meta.members.map(m => `<div class="kid-row"><span class="av-mid">${esc(m.avatar)}</span><div class="grow"><b>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</b>
            <small>${m.role === 'supervisor' ? '🛡️ Supervisor' : '🧒 Kid · ' + (m.ageGroup === 'senior' ? '13–18' : '8–12')}${m.lockUntil > G.now() ? ' · 🔒 locked' : ''}</small></div>
            <button class="btn small soft" data-act="m-pin" data-m="${m.id}">🔑 Reset PIN</button>${m.id !== me.id ? `<button class="x" data-act="m-del" data-m="${m.id}" aria-label="Remove">✕</button>` : ''}</div>`).join('')}
          <button class="btn primary block" data-act="m-add">➕ Add member</button>
          <p class="fine">Only supervisors can add kids or other supervisors.</p></section>
        <section class="card"><h3>⚙️ Family settings</h3>
          <div class="row gap"><input class="input grow" id="fs-name" maxlength="24" value="${esc(F.meta.name)}"><button class="btn soft" data-act="f-rename">Rename</button></div>
          <div class="col gap mt"><button class="btn soft block" data-act="f-code">🛟 Make a new recovery code</button>
            <button class="btn soft block" data-act="f-export">💾 Save encrypted family file (to move devices)</button>
            <button class="btn ghost block" data-act="go" data-to="modes">🔀 Switch mode</button>
            <button class="btn danger block" data-act="f-delete">🗑️ Delete this family</button></div>
          <p class="fine">🔐 All money data is encrypted with AES-256 before cloud sync. PINs are never stored.</p></section>`;
    },
    handlers: () => ({
      lock: () => G.famLock('fam-users'),
      switch: () => G.famLock('fam-users'),
      sdecide: (el) => {
        const { k, id, v } = el.dataset; const note = ((G.$(`#sn-${k}-${id}`) || {}).value || '').trim(); const me = meM();
        withKid(k, () => { const res = G.act.decide(id, v, note); if (res.ok) res.r.decidedBy = me.name; G.after(); });
        G.sound(v === 'declined' ? 'pop' : 'coin'); G.toast(`Sent: ${decideLbl[v]}`); G.render({ keepScroll: true });
      },
      'open-kid': (el) => { G.FAM.viewKid = el.dataset.k; G.S = G.FAM.data.kids[el.dataset.k]; if (!G.S.pinHash) G.S.pinHash = 'family'; G.parentUnlocked = true; G.go('grownup'); },
      'm-add': () => addMember(),
      'm-pin': (el) => resetPin(el.dataset.m),
      'm-del': async (el) => {
        const F = G.FAM; const m = memberOf(F.meta, el.dataset.m);
        if (m.role === 'supervisor' && F.meta.members.filter(x => x.role === 'supervisor').length < 2) return G.toast('A family needs at least one supervisor.');
        if (!(await G.confirm(`Remove ${esc(m.name)}?`, m.role === 'supervisor' ? 'They will no longer be able to log in.' : 'Their Gullak money diary will be deleted. This cannot be undone.', 'Remove', 'Cancel'))) return;
        if (F.cloudId && m.userId) {
          try { await G.cloud.removeFamilyMember(F.cloudId, m.userId); }
          catch (error) { return G.toast(error.message || 'Could not remove the cloud account from this family.'); }
        }
        F.meta.members = F.meta.members.filter(x => x.id !== m.id); delete F.data.kids[m.id]; delete F.data.sups[m.id];
        putFam(F.meta); await G.famSave(); G.render({ keepScroll: true });
      },
      'f-rename': async () => {
        const n = G.$('#fs-name').value.trim(); if (!n) return;
        if (G.FAM.cloudId) {
          try { await G.cloud.renameFamily(G.FAM.cloudId, n); }
          catch (error) { return G.toast(error.message || 'Could not rename the cloud family.'); }
        }
        G.FAM.meta.name = n; putFam(G.FAM.meta); await G.famSave(); G.toast('Renamed ✅'); G.render({ keepScroll: true });
      },
      'f-code': async () => {
        if (!(await G.confirm('Make a new recovery code?', 'The old code will stop working.', 'Make new code', 'Cancel'))) return;
        const F = G.FAM; const code = C.recoveryCode(); const salt = C.salt();
        const wrap = await C.wrapWithSecret(C.normCode(code), salt, F.fkRaw, F.meta.iter);
        if (F.cloudId) {
          try { await G.cloud.updateFamilyCode(F.cloudId, F.fkRaw, code); }
          catch (error) { return G.toast(error.message || 'Could not update the cloud recovery code.'); }
        }
        F.meta.rc = { salt, wrap }; putFam(F.meta); await G.famSave();
        G.modal({ html: `<h2>🛟 New recovery code</h2><p>Write it down and keep it safe.</p><div class="code big-code">${esc(code)}</div>
          <button class="btn soft block" data-act="cp">📋 Copy</button>`, handlers: { cp: () => G.copy(code) } });
      },
      'f-export': async () => {
        await G.famSave(); const F = G.FAM;
        const payload = { gullakFamily: 1, savedAt: G.now(), meta: F.meta, data: localStorage.getItem(DATA(F.meta.id)) };
        const modal = G.modal({
          html: '<h2>🔐 Export encrypted family backup</h2><p class="muted small">Choose a separate passphrase. You will need it to open this file on another device.</p><label class="label">Backup passphrase</label><input class="input" id="family-backup-export-pass" type="password" maxlength="256" autocomplete="new-password"><label class="label">Confirm passphrase</label><input class="input" id="family-backup-export-confirm" type="password" maxlength="256" autocomplete="new-password"><button class="btn primary block mt" data-act="make-family-backup">Create encrypted file</button>',
          handlers: {
            'make-family-backup': async button => {
              const pass = G.$('#family-backup-export-pass', modal.el).value;
              const confirm = G.$('#family-backup-export-confirm', modal.el).value;
              if (pass.length < 10) return G.toast('Use at least 10 characters for the backup passphrase.');
              if (pass !== confirm) return G.toast('The two passphrases do not match.');
              button.disabled = true; button.textContent = '🔐 Encrypting…';
              try {
                const text = await G.cloudBackup.encode(payload, pass);
                download(`gullak-family-${F.meta.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.gullak`, text, 'application/json');
                modal.close(); G.toast('Encrypted family backup created. Keep its passphrase safe.');
              } catch (error) {
                button.disabled = false; button.textContent = 'Create encrypted file';
                G.toast(error.message || 'Could not create family backup.');
              }
            }
          }
        });
      },
      'f-delete': async () => {
        const F = G.FAM;
        if (!(await G.confirm(`Delete "${esc(F.meta.name)}"?`, 'All members and money diaries on this device are erased. This cannot be undone!', 'Delete family', 'Cancel'))) return;
        if (!(await G.confirm('Are you really sure?', 'Last chance. Save a family file first if you want a copy.', 'Yes, delete', 'No'))) return;
        if (F.cloudId) {
          try { await G.cloud.deleteFamily(F.cloudId); }
          catch (error) { return G.toast(error.message || 'Could not delete the cloud family.'); }
        }
        const id = F.meta.id; G.FAM = null; sessionStorage.removeItem(SESS); dropFam(id);
        if (localStorage.getItem(LAST) === id) localStorage.removeItem(LAST);
        G.S = G.fresh(); G.chat.length = 0; if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
        location.hash = '#/fam-pick'; setTimeout(() => location.reload(), 30); // reload so nothing stays in memory
      }
    })
  };

  const addMember = () => {
    const st = { role: 'member', avatar: '🦁', age: 'junior', freq: 'weekly', busy: false };
    const m = G.modal({
      html: `<h2>➕ Add a family member</h2>
        <div class="seg"><button class="seg-b on" data-act="role" data-v="member">🧒 Kid<small>uses Gullak</small></button><button class="seg-b" data-act="role" data-v="supervisor">🛡️ Supervisor<small>grown-up, approves</small></button></div>
        <div class="label">Nickname</div><input class="input" id="am-name" maxlength="14" placeholder="e.g. Rocket (not a real name)">
        ${G.FAM.cloudId ? '<div class="label">Their Gullak account username</div><input class="input" id="am-username" maxlength="24" autocomplete="off" placeholder="They must create an account first"><p class="hint">This links their own login to this family member.</p>' : ''}
        <div class="avatar-grid sm">${G.AVATARS.concat(['👩', '👨', '👵', '👴']).map(a => `<button class="av ${a === st.avatar ? 'on' : ''}" data-act="av" data-v="${a}">${a}</button>`).join('')}</div>
        <div id="am-kid"><div class="label">Age group</div>
          <div class="seg"><button class="seg-b on" data-act="age" data-v="junior">8–12</button><button class="seg-b" data-act="age" data-v="senior">13–18</button></div>
          <div class="label">Pocket money (pretend)</div>
          <div class="row gap"><input class="input grow" id="am-pm" type="number" inputmode="numeric" min="0" value="100">
          <div class="seg"><button class="seg-b on" data-act="freq" data-v="weekly">Weekly</button><button class="seg-b" data-act="freq" data-v="monthly">Monthly</button></div></div></div>
        <div class="label">Their PIN (4–6 digits)</div><input class="input big" id="am-pin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN">
        <p class="hint">Tell them their PIN. They can't change it themselves. A supervisor resets it if they forget.</p>
        <button class="btn primary block big" data-act="ok">Add member</button>`,
      handlers: {
        role: (el) => { st.role = el.dataset.v; G.$$('[data-act=role]', m.el).forEach(b => b.classList.toggle('on', b === el)); G.$('#am-kid', m.el).hidden = st.role !== 'member'; },
        av: (el) => { st.avatar = el.dataset.v; G.$$('.av', m.el).forEach(b => b.classList.toggle('on', b === el)); },
        age: (el) => { st.age = el.dataset.v; G.$$('[data-act=age]', m.el).forEach(b => b.classList.toggle('on', b === el)); },
        freq: (el) => { st.freq = el.dataset.v; G.$$('[data-act=freq]', m.el).forEach(b => b.classList.toggle('on', b === el)); },
        ok: async (el) => {
          if (st.busy) return;
          const name = G.$('#am-name', m.el).value.trim(), pin = G.$('#am-pin', m.el).value;
          if (!name) return G.toast('Type a nickname'); if (!/^\d{4,6}$/.test(pin)) return G.toast('PIN must be 4 to 6 digits');
          const F = G.FAM; if (F.meta.members.some(x => x.name.toLowerCase() === name.toLowerCase())) return G.toast('Someone already has that nickname');
          st.busy = true; el.disabled = true; el.textContent = '🔐 Locking…';
          try {
            let userId = null;
            if (F.cloudId) {
              const username = G.$('#am-username', m.el).value.trim();
              if (!/^[a-z0-9_]{3,24}$/i.test(username)) throw new Error('Enter the member\'s Gullak account username. They must create their account first.');
              const linked = await G.cloud.addFamilyMember(F.cloudId, username, st.role);
              userId = linked.member.user_id;
            }
            const mem = await makeMember({ name, avatar: st.avatar, role: st.role, ageGroup: st.age, pin }, F.fkRaw, F.meta.iter);
            if (userId) mem.userId = userId;
            F.meta.members.push(mem);
            if (st.role === 'member') F.data.kids[mem.id] = kidState(mem, { pocketMoney: Math.max(0, Math.round(Number(G.$('#am-pm', m.el).value) || 0)), frequency: st.freq });
            else F.data.sups[mem.id] = {};
            putFam(F.meta); await G.famSave(); m.close(); G.sound('win'); G.toast(`${esc(st.avatar)} ${esc(name)} joined the family!`); G.render({ keepScroll: true });
          } catch (error) {
            st.busy = false; el.disabled = false; el.textContent = 'Add member';
            G.toast(error.message || 'Could not add this member.');
          }
        }
      }
    });
  };
  const resetPin = (mid) => {
    const F = G.FAM; const mem = memberOf(F.meta, mid);
    const m = G.modal({
      html: `<h2>🔑 New PIN for ${esc(mem.avatar)} ${esc(mem.name)}</h2><input class="input big" id="rp" type="password" inputmode="numeric" maxlength="6" placeholder="New PIN (4–6 digits)">
        <button class="btn primary block big" data-act="ok">Save PIN</button>`,
      handlers: {
        ok: async (el) => {
          const pin = G.$('#rp', m.el).value; if (!/^\d{4,6}$/.test(pin)) return G.toast('PIN must be 4 to 6 digits');
          el.disabled = true; el.textContent = '🔐 Saving…';
          mem.salt = C.salt(); mem.wrap = await C.wrapWithSecret(pin, mem.salt, F.fkRaw, F.meta.iter); mem.pinLen = pin.length; mem.fail = 0; mem.lockUntil = 0;
          putFam(F.meta); await G.famSave(); m.close(); G.toast(`🔑 ${esc(mem.name)}'s PIN changed`); G.render({ keepScroll: true });
        }
      }
    });
  };

  /* ---------- supervisor looking after one kid: reuse the full Grown-up dashboard ---------- */
  (() => {
    const sc = G.screens.grownup; const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => {
      let html = r0(q);
      if (!isSup() || !G.FAM.viewKid) return html;
      const k = memberOf(G.FAM.meta, G.FAM.viewKid);
      html = html.replace('<button class="back" data-act="go" data-to="home"', '<button class="back" data-act="go" data-to="sup"')
        .replace('<h1>🔒 Grown-up mode</h1>', `<h1>${esc(k.avatar)} ${esc(k.name)} · grown-up view</h1>`)
        .replace('<button class="btn soft grow" data-act="newpin">Change PIN</button><button class="btn primary grow" data-act="lock">🔒 Lock & exit</button>', '<button class="btn primary grow" data-act="go" data-to="sup">← Back to family</button>');
      return html;
    };
    sc.handlers = (q) => Object.assign(h0(q), isSup() ? { lock: () => G.go('sup'), newpin: () => G.go('sup') } : {});
  })();

  /* ---------- kid side ---------- */
  (() => { // Home: switch-user button + family chip; sample banner "Start my own" goes to the mode chooser
    const sc = G.screens.home; const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => {
      let html = r0(q);
      if (isKid()) {
        const F = G.FAM; const waiting = G.S.requests.filter(r => r.status === 'pending' && r.sentTo && r.sentTo.length).length;
        html = html.replace('<button class="icon-btn" data-act="go" data-to="grownup" aria-label="Grown-up mode">🔒</button>', '<button class="icon-btn" data-act="fam-switch" aria-label="Switch user">👥</button>')
          .replace('<section class="pig-card">', `<div class="fam-chip">${esc(F.meta.emoji)} <b>${esc(F.meta.name)}</b>${waiting ? ` · 📨 ${G.plural(waiting, 'ask')} sent` : ''}<button class="link" data-act="fam-switch">Switch user</button></div><section class="pig-card">`);
      }
      return html;
    };
    sc.handlers = (q) => Object.assign(h0(q), { 'fam-switch': () => G.famLock('fam-users'), 'reset-real': async () => {
      if (!(await G.confirm('Start your own Gullak?', 'This clears the sample data. A grown-up will set a PIN first.', 'Yes, start fresh', 'Keep exploring'))) return;
      G.freshStart('me-pin');
    } });
  })();

  (() => { // Settings: mode switch everywhere; in Family mode the device-data buttons are replaced
    const sc = G.screens.settings; const r0 = sc.render, h0 = sc.handlers;
    sc.render = (q) => {
      let html = r0(q);
      if (G.mode() === 'family') {
        return html.replace(/<section class="card"><h3>My data<\/h3>[\s\S]*?<\/section>/, `<section class="card"><h3>👨‍👩‍👧 Family</h3>
          <p class="small muted">You're in <b>${esc(G.FAM.meta.emoji)} ${esc(G.FAM.meta.name)}</b>. Your money diary is encrypted before cloud sync. Supervisors manage members and PINs.</p>
          <div class="col gap"><button class="btn soft block" data-act="fam-switch">👥 Switch user</button><button class="btn ghost block" data-act="go" data-to="modes">🔀 Switch mode</button></div></section>`)
          .replace(/<input class="input" id="s-nick"[^>]*>/, `<input class="input" id="s-nick" maxlength="14" value="${esc(G.S.profile.nickname)}" aria-label="Nickname" disabled>`);
      }
      return html.replace('<section class="card"><h3>My data</h3>', `<section class="card"><h3>🔀 Mode</h3><p class="small muted">You're using <b>🧒 Individual</b> mode.</p>
        <button class="btn soft block" data-act="go" data-to="modes">Switch to Family mode</button></section><section class="card"><h3>My data</h3>`);
    };
    sc.handlers = (q) => Object.assign(h0(q), {
      'fam-switch': () => G.famLock('fam-users'),
      reset: async () => { // Individual "Start over": wipe the saved data AND everything in memory
        if (!(await G.confirm('Delete everything?', 'Your Gullak will be empty. This cannot be undone!', 'Delete all', 'Cancel'))) return;
        G.freshStart('welcome');
      }
    });
  })();

  /* Start over = delete Individual data, then reload the app so nothing stays in memory
     (Hey Gullak chat, its last sum, half-played games, typed answers). Family data is not touched. */
  G.freshStart = (route) => {
    localStorage.removeItem('gullak:v1'); localStorage.setItem(MODE, 'individual');
    G.S = G.fresh(); G.parentUnlocked = false; G.chat.length = 0;
    if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
    location.hash = '#/' + route;
    setTimeout(() => location.reload(), 30);
  };

  /* Ask: "Can I buy this, Mum?" goes to chosen supervisors in the family */
  const share0 = G.openShare;
  G.openShare = (r) => {
    if (!isKid()) return share0(r);
    const sups = G.FAM.meta.members.filter(m => m.role === 'supervisor');
    const m = G.modal({
      html: `<h2>📨 Who should decide?</h2><p class="muted">Pick your grown-ups. They'll see your ask when they open Gullak.</p>
        <div class="sup-pick">${sups.map(s => `<label class="sup-opt"><input type="checkbox" value="${s.id}" checked><span class="av-mid">${esc(s.avatar)}</span><b>${esc(s.name)}</b></label>`).join('')}</div>
        <button class="btn primary block big" data-act="fsend">📨 Send to my family</button>`,
      topBtn: { act: 'later', label: '⏰ Later' },
      handlers: {
        fsend: () => {
          const ids = G.$$('.sup-opt input:checked', m.el).map(i => i.value); if (!ids.length) return G.toast('Pick at least one grown-up');
          r.sentTo = ids; G.save(); m.close(); G.sound('coin');
          G.toast(`📨 Sent to ${esc(ids.map(id => memberOf(G.FAM.meta, id).name).join(' & '))}! They'll decide when they log in.`, 4000); G.render();
        },
        later: () => { m.close(); G.toast('⏰ Saved! Tap 📨 on the Ask screen when you want to send it.', 4000); G.render(); }
      }
    });
  };

  /* Ask screen: show who it was sent to */
  (() => {
    const sc = G.screens.ask; const r0 = sc.render;
    sc.render = (q) => {
      let html = r0(q); if (!isKid()) return html;
      html = html.replace(/<div class="row gap mt"><input class="input grow" id="code"[\s\S]*?<\/div>/, ''); // no reply codes in Family mode
      G.S.requests.filter(r => r.status === 'pending' && r.sentTo && r.sentTo.length).forEach(r => {
        const who = r.sentTo.map(id => { const m = memberOf(G.FAM.meta, id); return m ? m.avatar + ' ' + m.name : ''; }).filter(Boolean).join(', ');
        html = html.replace(`data-act="share" data-id="${r.id}">📨 Show / send</button>`, `data-act="share" data-id="${r.id}">📨 Sent to ${esc(who)}</button>`);
      });
      return html;
    };
  })();
  /* decisions show who decided */
  (() => {
    const sc = G.screens.home; const r0 = sc.render;
    sc.render = (q) => {
      let html = r0(q);
      (G.S.requests || []).filter(r => r.decidedBy && !r.seen).forEach(r => { html = html.replace(`${r.emoji} <b>${esc(r.item)}</b>:`, `${r.emoji} <b>${esc(r.item)}</b> (${esc(r.decidedBy)}):`); });
      return html;
    };
  })();
})(window.G);
