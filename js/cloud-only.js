/* Cloud-only storage and recovery layer. Loaded after cloud-ui.js. */
(function (G) {
  'use strict';
  const C = G.cr;
  let mode = 'individual';
  const familyCache = new Map();
  let activeFamilyId = null;
  const safeCopy = value => JSON.parse(JSON.stringify(value));
  const familyKey = key => /^gullak:(families|famdata:|lastfam|mode|famsession)/.test(String(key));
  const cloudOnlyKey = key => familyKey(key) || String(key) === 'gullak:v1';

  // Family indexes, family ciphertext and mode selection are memory-only.
  const ls = window.localStorage;
  const ss = window.sessionStorage;
  if (ls && !ls.__gullakCloudOnly) {
    const get = ls.getItem.bind(ls), set = ls.setItem.bind(ls), remove = ls.removeItem.bind(ls);
    Object.defineProperty(ls, '__gullakCloudOnly', { value: true });
    ls.getItem = key => cloudOnlyKey(key) ? null : get(key);
    ls.setItem = (key, value) => cloudOnlyKey(key) ? undefined : set(key, value);
    ls.removeItem = key => familyKey(key) ? undefined : remove(key);
  }
  if (ss && !ss.__gullakCloudOnly) {
    const set = ss.setItem.bind(ss), get = ss.getItem.bind(ss), remove = ss.removeItem.bind(ss);
    Object.defineProperty(ss, '__gullakCloudOnly', { value: true });
    ss.getItem = key => String(key) === 'gullak:famsession' ? null : get(key);
    ss.setItem = (key, value) => String(key) === 'gullak:famsession' ? undefined : set(key, value);
    ss.removeItem = key => String(key) === 'gullak:famsession' ? undefined : remove(key);
  }

  G.mode = () => mode;
  // Do not expose an old browser-cached diary before cloud authentication.
  G.S = G.fresh();
  G.parentUnlocked = false;
  const setMode0 = G.setMode;
  G.setMode = next => {
    mode = next === 'family' ? 'family' : 'individual';
    G.FAM = null; G.parentUnlocked = false;
    G.S = mode === 'family' ? G.fresh() : G.fresh();
    G.storeKey = 'gullak:none';
  };


  // A diary cannot be started or edited until its cloud account is unlocked.
  const modesHandlers0 = G.screens.modes && G.screens.modes.handlers;
  const modesRender0 = G.screens.modes && G.screens.modes.render;
  if (G.screens.modes) {
    G.screens.modes.render = () => {
      const html = modesRender0();
      return html
        .replace('Continue my Gullak', 'Open your cloud-synced Individual Gullak.')
        .replace('One kid on this device. A grown-up sets a PIN first.', 'Open your cloud-synced Individual Gullak.')
        .replace('Choose your family, pick who you are, enter your PIN. Supervisors approve asks.', 'Find or create a cloud family, then choose your profile.');
    };
    G.screens.modes.handlers = () => Object.assign(modesHandlers0 ? modesHandlers0() : {}, {
      'mode-me': () => {
        mode = 'individual';
        if (!G.cloudAccount.unlocked) { G.go('cloud-account'); return; }
        if (G.S && G.S.profile) { G.go('home'); return; }
        G.setMode('individual'); G.go('me-pin');
      },
      'mode-fam': () => {
        mode = 'family'; G.setMode('family');
        G.go('fam-pick');
      }
    });
  }
  // Prevent even programmatic navigation or mode-switch buttons from opening Modes
  // after login. Send users to the appropriate signed-in destination instead.
  const goCloudOnly0 = G.go;
  G.go = (name, q) => {
    if (name === 'modes' && G.cloudAccount && G.cloudAccount.unlocked) {
      if (mode === 'family') return goCloudOnly0(G.FAM ? (G.isSupervisor && G.isSupervisor() ? 'sup' : 'home') : 'fam-pick', q);
      return goCloudOnly0(G.S && G.S.profile ? 'home' : 'me-pin', q);
    }
    return goCloudOnly0(name, q);
  };

  const routeGuardCloudOnly0 = G.routeGuard;
  G.routeGuard = (name, q) => {
    const prior = routeGuardCloudOnly0 ? routeGuardCloudOnly0(name, q) : null;
    if (!G.cloudAccount.unlocked && !G.backupTemporary) {
      if (!['welcome', 'modes', 'cloud-account', 'cloud-families', 'cloud-family-join', 'fam-pick', 'fam-users'].includes(name)) return 'cloud-account';
      return prior;
    }
    // Once signed in, the welcome/mode chooser is never a destination.
    // Preserve Family's own role-aware redirect (supervisor -> sup, member -> home).
    if (name === 'welcome' || name === 'modes') {
      // First-time Individual setup must continue through the kid profile wizard
      // after the grown-up has saved the PIN and house rules. Do not send it
      // back to me-pin until that onboarding has actually been completed.
      if (name === 'welcome' && mode !== 'family' && !G.S?.profile && G._pendingPin && G._pendingRules) return null;
      if (prior) return prior;
      if (mode === 'family') return G.FAM ? 'sup' : 'fam-pick';
      return G.S && G.S.profile ? 'home' : 'me-pin';
    }
    return prior;
  };

  // Never fall back to browser persistence. An unavailable cloud session is a visible error.
  const cloudSave0 = G.save;
  let individualChain = Promise.resolve();
  G.save = function () {
    if (G.backupTemporary) return Promise.resolve();
    if (!G.cloudAccount || !G.cloudAccount.unlocked) {
      G.cloudSavePending = true;
      return;
    }
    if (mode === 'family') {
      if (G.FAM) {
        if (G.isFamilyKid && G.isFamilyKid()) G.FAM.data.kids[G.FAM.mid] = safeCopy(G.S);
        G.famSave();
      }
      return;
    }
    if (!G.S || !G.S.profile) return;
    const snapshot = safeCopy(G.S);
    individualChain = individualChain.catch(() => {}).then(() =>
      G.cloud.saveVault(snapshot, G.cloudAccount.encryptionPassphrase)
    ).catch(error => {
      G.cloudSaveError = error;
      console.error('Gullak cloud save failed:', error);
      G.toast('☁️ Could not sync this change. Check your connection and try again.');
    });
    return individualChain;
  };
  G.waitForCloudSync = async () => {
    await individualChain;
    await familyChain.catch(error => { throw error; });
    if (G.cloudSaveError) throw G.cloudSaveError;
  };

  const loadFamily = async (meta, fkRaw, memberId) => {
    const key = await C.aesKey(fkRaw);
    const remote = await G.cloud.getFamilyVault(meta.cloudId, fkRaw);
    if (!remote || !remote.value || !remote.value.meta) throw new Error('The encrypted family details could not be loaded.');
    const cloudMeta = remote.value.meta;
    cloudMeta.cloudId = meta.cloudId;
    const data = remote.value.data || { v: 1, kids: {}, sups: {}, defaults: {} };
    data.kids = data.kids || {}; data.sups = data.sups || {};
    const member = cloudMeta.members.find(m => m.id === memberId);
    if (!member || member.userId !== G.cloudAccount.user.user_id) throw new Error('This Gullak account is not linked to that family member.');
    if (member.role === 'supervisor') {
      for (const m of cloudMeta.members.filter(x => x.role === 'member' && x.userId)) {
        const row = await G.cloud.getMemberVault(meta.cloudId, m.userId, fkRaw);
        if (row.exists) data.kids[m.id] = row.value;
      }
    } else {
      const row = await G.cloud.getMemberVault(meta.cloudId, G.cloudAccount.user.user_id, fkRaw);
      if (row.exists) data.kids[member.id] = row.exists ? row.value : (data.kids[member.id] || null);
    }
    const F = G.FAM = { meta: cloudMeta, fk: key, fkRaw, data, mid: member.id, role: member.role, cloudId: meta.cloudId };
    activeFamilyId = meta.cloudId;
    mode = 'family';
    familyCache.set(meta.cloudId, { meta: cloudMeta, fkRaw });
    G.parentUnlocked = false;
    if (member.role === 'member') {
      const state = G.normState(data.kids[member.id] || G.fresh());
      state.profile = state.profile || { nickname: member.name, avatar: member.avatar, ageGroup: member.ageGroup || 'junior', pocketMoney: 0, frequency: 'weekly', createdAt: G.now() };
      state.profile.nickname = member.name; state.profile.avatar = member.avatar;
      data.kids[member.id] = state; G.S = state;
      state.meta.prevOpen = state.meta.lastOpen || G.now(); state.meta.lastOpen = G.now();
    } else G.S = G.fresh();
    await G.famSave();
    G.go(member.role === 'supervisor' ? 'sup' : 'home');
  };

  let familyChain = Promise.resolve();
  G.famSave = function () {
    const F = G.FAM;
    if (!F) return Promise.resolve();
    if (!F.cloudId) return Promise.resolve();
    if (!G.cloudAccount.unlocked) return Promise.reject(new Error('Family cloud account is locked.'));
    const snap = safeCopy(F);
    familyChain = familyChain.catch(() => {}).then(async () => {
      if (snap.role === 'supervisor') {
        await G.cloud.saveFamilyVault(snap.cloudId, snap.fkRaw, {
          meta: snap.meta,
          data: { v: 1, defaults: snap.data.defaults || {}, createdAt: snap.data.createdAt }
        });
        for (const member of snap.meta.members.filter(m => m.role === 'member' && m.userId)) {
          const state = snap.data.kids[member.id];
          if (state) await G.cloud.saveMemberVault(snap.cloudId, member.userId, snap.fkRaw, state);
        }
      } else {
        const account = G.cloudAccount.user;
        const member = snap.meta.members.find(m => m.id === snap.mid);
        if (!member || member.userId !== account.user_id) throw new Error('Family member account link is missing.');
        await G.cloud.saveMemberVault(snap.cloudId, account.user_id, snap.fkRaw, snap.data.kids[snap.mid] || G.S);
      }
      G.cloudFamilySaveError = null;
    }).catch(error => {
      G.cloudFamilySaveError = error;
      console.error('Gullak family sync failed:', error);
      G.toast('☁️ Family change could not sync. Please retry before leaving.');
      throw error;
    });
    return familyChain;
  };

  const famCreate0 = G.famCreate;
  G.famCreate = async args => {
    if (!G.cloudAccount.unlocked) throw new Error('Log in to your Gullak Cloud account first.');
    const code = await famCreate0(args);
    const F = G.FAM;
    if (!F) throw new Error('Family setup did not finish.');
    const creator = F.meta.members.find(m => m.id === F.mid);
    if (!creator || !G.cloudAccount.user) throw new Error('The first Supervisor account is missing.');
    creator.userId = G.cloudAccount.user.user_id;
    const initialValue = {
      meta: F.meta,
      data: { v: 1, defaults: F.data.defaults || {}, createdAt: F.data.createdAt }
    };
    const created = await G.cloud.createFamily({
      name: F.meta.name,
      joinCode: code,
      familyKeyRaw: F.fkRaw,
      value: initialValue
    });
    F.cloudId = created.family_id;
    F.meta.cloudId = created.family_id;
    familyCache.set(F.cloudId, { meta: F.meta, fkRaw: F.fkRaw });
    await G.cloud.saveFamilyVault(F.cloudId, F.fkRaw, initialValue);
    await G.famSave();
    return code;
  };

  G.famUnlock = async (familyId, memberId, pin) => {
    const cached = familyCache.get(familyId) || (G.FAM && G.FAM.meta.id === familyId ? { meta: G.FAM.meta, fkRaw: G.FAM.fkRaw } : null);
    if (!cached) throw new Error('Choose or join this cloud family first.');
    const member = cached.meta.members.find(m => m.id === memberId);
    if (!member) throw new Error('Family member not found.');
    if (!G.cloudAccount.user || member.userId !== G.cloudAccount.user.user_id) {
      throw new Error('This Gullak account is not linked to that family member. Ask a supervisor to link your account.');
    }
    if (!cached.meta.cloudId || !cached.fkRaw) throw new Error('Open the family with its shared Family PIN first.');
    await loadFamily(cached, cached.fkRaw, memberId);
  };

  G.famLock = (to = 'fam-users') => {
    const id = activeFamilyId;
    if (G.FAM) { G.FAM = null; G.S = G.fresh(); }
    G.parentUnlocked = false; G.chat && (G.chat.length = 0);
    if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
    G.go(to, id ? { f: id } : undefined);
  };

  // Cloud directory is the only family picker; no local family index is consulted.
  G.screens['fam-pick'] = {
    bare: true,
    render: () => '<section class="ob"><header class="page-h"><h1>👨‍👩‍👧 Family</h1></header><section class="card"><p class="muted">Search the cloud directory and select a family.</p><button class="btn primary block" data-act="open-cloud-families">☁️ Find / open a family</button><button class="btn soft block mt" data-act="new-cloud-family">➕ Create a family</button></section></section>',
    handlers: () => ({
      'open-cloud-families': () => {
        mode = 'family';
        G.go('cloud-families');
      },
      'new-cloud-family': () => {
        mode = 'family';
        if (!G.cloudAccount.unlocked) { G.cloudFamilyReturn = 'create'; G.go('cloud-account'); }
        else G.go('fam-create');
      }
    })
  };

  const famUsers = G.screens['fam-users'];
  G.screens['fam-users'] = {
    bare: true,
    render: q => {
      activeFamilyId = q.f || activeFamilyId;
      const cached = familyCache.get(q.f) || (G.FAM && G.FAM.meta.id === q.f ? { meta: G.FAM.meta, fkRaw: G.FAM.fkRaw } : null);
      const meta = cached && cached.meta;
      if (!meta) return '<section class="card"><p>Open this family with its shared Family PIN first.</p><button class="btn primary block" data-act="go" data-to="cloud-families">Find family</button></section>';
      const members = meta.members || [];
      return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>' + G.esc(meta.emoji || '👨‍👩‍👧') + ' ' + G.esc(meta.name) + '</h1></header><section class="card"><h2>Family members</h2><p class="small muted">Choose your profile. Each person signs in with their own Gullak account.</p>' +
        members.map(m => {
          const linked = !!linkedId && m.userId === linkedId;
          return '<button class="kid-row block" data-act="choose-member" data-mid="' + G.esc(m.id) + '"><b>' + G.esc(m.name) + '</b><small>' + (m.role === 'supervisor' ? 'Supervisor' : 'Kid') + '</small></button>';
        }).join('') +
        '</section></section>';
    },
    handlers: q => ({ 'choose-member': async el => {
      const familyId = q.f || activeFamilyId, memberId = el.dataset.mid;
      if (!G.cloudAccount.unlocked) {
        G.pendingFamilyMember = { familyId, memberId };
        G.cloudFamilyReturn = 'member';
        G.go('cloud-account');
        return;
      }
      try { await G.famUnlock(familyId, memberId); }
      catch (error) { G.toast(error.message || 'This account is not linked to the selected member.'); }
    } })
  };
  G.screens['fam-pin'] = {
    bare: true,
    render: () => '<section class="card"><p>The shared Family PIN opens the family. Each member uses their own Gullak account password.</p><button class="btn primary block" data-act="go" data-to="cloud-families">Find family</button></section>',
    handlers: () => ({})
  };


  G.screens['fam-recover'] = {
    bare: true,
    render: q => {
      const cached = familyCache.get(q.f);
      const member = cached && cached.meta.members.find(m => m.id === q.m);
      if (!cached || !member) return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>Recover PIN</h1></header><section class="card"><p>Open the family with its recovery code first, then choose the member again.</p><button class="btn primary block" data-act="go" data-to="cloud-families">Find family</button></section></section>';
      if (member.role !== 'supervisor' || !G.cloudAccount.user || member.userId !== G.cloudAccount.user.user_id) {
        return '<section class="ob"><header class="page-h"><button class="back" data-act="back-family-pin">←</button><h1>Recover PIN</h1></header><section class="card"><p>Ask a linked family supervisor to reset this PIN from their account.</p><button class="btn primary block" data-act="back-family-members">Back to members</button></section></section>';
      }
      return '<section class="ob"><header class="page-h"><button class="back" data-act="back-family-pin">←</button><h1>🔑 Reset supervisor PIN</h1></header><section class="card"><p class="small muted">The family recovery code has unlocked the family key. Choose a new 4–6 digit PIN.</p><label class="label">New PIN</label><input class="input big" id="recover-family-pin-1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"><label class="label">Confirm PIN</label><input class="input big" id="recover-family-pin-2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"><button class="btn primary block big" data-act="save-family-pin">Save new PIN</button></section></section>';
    },
    handlers: q => ({
      'back-family-pin': () => G.go('fam-pin', { f: q.f, m: q.m }),
      'back-family-members': () => G.go('fam-users', { f: q.f }),
      'save-family-pin': async button => {
        const cached = familyCache.get(q.f);
        const member = cached && cached.meta.members.find(m => m.id === q.m);
        const first = G.$('#recover-family-pin-1').value, second = G.$('#recover-family-pin-2').value;
        if (!cached || !member || member.role !== 'supervisor' || member.userId !== G.cloudAccount.user?.user_id) return G.toast('This supervisor account is not linked to this family.');
        if (!/^\d{4,6}$/.test(first)) return G.toast('PIN must be 4–6 digits.');
        if (first !== second) return G.toast('The two PINs do not match.');
        button.disabled = true; button.textContent = '🔐 Saving…';
        try {
          member.salt = C.salt();
          member.wrap = await C.wrapWithSecret(first, member.salt, cached.fkRaw, cached.meta.iter);
          member.pinLen = first.length; member.fail = 0; member.lockUntil = 0;
          const remote = await G.cloud.getFamilyVault(q.f, cached.fkRaw);
          if (!remote.value || !remote.value.meta) throw new Error('Could not load the encrypted family details.');
          remote.value.meta = cached.meta;
          await G.cloud.saveFamilyVault(q.f, cached.fkRaw, remote.value);
          familyCache.set(q.f, cached);
          G.toast('Supervisor PIN reset and synced.');
          G.go('fam-pin', { f: q.f, m: q.m });
        } catch (error) {
          button.disabled = false; button.textContent = 'Save new PIN';
          G.toast(error.message || 'Could not reset the PIN.');
        }
      }
    })
  };

  // Existing members open their family; new linked accounts join it. These are
  // separate operations: opening must never run the join endpoint.
  G.screens['cloud-family-join'].handlers = () => ({
    'family-join': async button => {
      const selected = G.selectedCloudFamily;
      if (!selected) return G.toast('Choose a family first.');
      if (!selected.is_member) return G.toast('Ask a family supervisor to add your Gullak username, then refresh the family list.');
      const code = G.$('#cloud-family-code').value.trim();
      if (!/^\d{4,6}$/.test(code)) return G.toast('Enter the 4–6 digit shared Family PIN.');
      button.disabled = true;
      try {
        const opened = await G.cloud.openFamily(selected.id, code);
        const meta = opened.value && opened.value.meta;
        if (!meta || !Array.isArray(meta.members)) throw new Error('Family metadata is invalid.');
        meta.cloudId = selected.id;
        familyCache.set(meta.cloudId, { meta, fkRaw: opened.familyKeyRaw });
        activeFamilyId = meta.cloudId;
        mode = 'family';
        G.setMode('family');
        G.go('fam-users', { f: meta.cloudId });
      } catch (error) { button.disabled = false; G.toast(error.message || (selected.is_member ? 'Could not open family.' : 'Could not join family.')); }
    }
  });
  G.screens['cloud-family-join'].render = () => {
    const selected = G.selectedCloudFamily || {};
    const opening = !!selected.is_member;
    return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>' + (opening ? '🔓 Open family' : '👋 Join family') + '</h1></header><section class="card"><h2>' + G.esc(selected.name || 'Family') + '</h2><p class="small muted">' + (opening ? 'Enter the shared Family PIN to view the family members.' : 'Your account must already be linked by a family supervisor. Enter the shared Family PIN to view the family members.') + '</p><label class="label">Shared Family PIN</label><input class="input big" id="cloud-family-code" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="4–6 digit PIN"><button class="btn primary block big" data-act="family-join">' + (opening ? 'Open and unlock' : 'Join and unlock') + '</button></section></section>';
  };

  const originalCloudFamilies = G.screens['cloud-families'];
  const oldSelect = originalCloudFamilies.handlers;
  G.screens['cloud-families'].handlers = () => ({
    'cloud-login': () => G.go('cloud-account'),
    'family-create': () => G.go('fam-create'),
    'family-search': async () => {
      const q = G.$('#cloud-family-query').value.trim();
      if (q.length < 2) return G.toast('Type at least 2 characters.');
      try { G.cloudFamilyResults = await G.cloud.searchFamilies(q); G.render({ keepScroll: true }); }
      catch (e) { G.toast(e.message || 'Search failed.'); }
    },
    'family-select': el => { G.selectedCloudFamily = { id: el.dataset.id, name: el.dataset.name, is_member: el.dataset.member === 'true' }; G.go('cloud-family-join'); },
    'family-refresh': async () => {
      try { G.cloudFamilyResults = await G.cloud.listFamilies(); G.render({ keepScroll: true }); }
      catch (e) { G.toast(e.message || 'Could not load families.'); }
    }
  });
  G.screens['cloud-families'].render = () => {
    const rows = (G.cloudFamilyResults || []).map(f => '<div class="kid-row"><div class="grow"><b>' + G.esc(f.name) + '</b><small>Cloud family</small></div><button class="btn small soft" data-act="family-select" data-member="true" data-id="' + G.esc(f.family_id) + '" data-name="' + G.esc(f.name) + '">Select</button></div>').join('');
    return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-pick">←</button><h1>☁️ Find a family</h1></header><section class="card"><input class="input" id="cloud-family-query" maxlength="64" placeholder="Search family name"><button class="btn primary block mt" data-act="family-search">Search</button><div class="col gap mt">' + (rows || (G.cloudFamilyLoading ? '<p class="muted small">Loading your families…</p>' : '<p class="muted small">' + G.esc(G.cloudFamilyLoadError || 'No families shown yet. Search or refresh your families. If it is not linked to your account yet, ask a supervisor to add your username.') + '</p>')) + '</div><button class="btn soft block mt" data-act="family-refresh">Refresh my families</button><button class="btn primary block mt" data-act="family-create">➕ Create a new family</button><label class="btn ghost block file-btn mt">Import encrypted family backup<input id="cloud-family-import-file" type="file" accept=".gullak,.json,application/json" hidden></label></section></section>';
  };


  async function importCloudFamilyBackup(rawText, backupPass) {
    const payload = await G.cloudBackup.decode(rawText, backupPass);
    if (!payload || payload.gullakFamily !== 1 || !payload.meta || !Array.isArray(payload.meta.members) || typeof payload.data !== 'string') throw new Error('Invalid Family backup.');
    const meta = safeCopy(payload.meta);
    const raw = payload.familyKey ? C.unb64(payload.familyKey) : await (async () => {
      const recovery = window.prompt('This is an older Family backup. Enter its previous recovery code:');
      if (!recovery) throw new Error('The legacy recovery code is required for this older backup.');
      return C.unwrapWithSecret(C.normCode(recovery), meta.rc.salt, meta.rc.wrap, meta.iter);
    })();
    const key = await C.aesKey(raw);
    const data = JSON.parse(await C.decStr(key, payload.data));
    data.kids = data.kids || {}; data.sups = data.sups || {};
    const matches = await G.cloud.searchFamilies(meta.name);
    const exact = matches.filter(x => String(x.name).toLowerCase() === String(meta.name).toLowerCase());
    const mine = await G.cloud.listFamilies();
    const replace = mine.find(x => String(x.name).toLowerCase() === String(meta.name).toLowerCase() && x.role === 'supervisor');
    if (exact.length && !replace) throw new Error('A family with this name exists, but this account is not its supervisor.');
    if (replace && !(await G.confirm('Replace the existing family?', 'The imported cloud copy will be verified before the old family is deleted.', 'Replace family', 'Cancel'))) return;
    const supervisor = meta.members.find(x => x.role === 'supervisor' && x.userId === G.cloudAccount.user.user_id) || meta.members.find(x => x.role === 'supervisor');
    if (!supervisor) throw new Error('No supervisor exists in this backup.');
    supervisor.userId = G.cloudAccount.user.user_id;
    const pinNumber = C.rand(4).reduce((value, byte) => (value * 256 + byte) >>> 0, 0);
    const code = String(100000 + (pinNumber % 900000)), salt = C.salt();
    meta.rc = { salt, wrap: await C.wrapWithSecret(C.normCode(code), salt, raw, meta.iter) };
    const created = await G.cloud.createFamily({ name: meta.name, joinCode: code, familyKeyRaw: raw, value: { meta, data: { v: 1, defaults: data.defaults || {}, createdAt: data.createdAt } } });
    meta.cloudId = created.family_id;
    for (const member of meta.members) {
      if (member.id === supervisor.id) continue;
      const username = member.username || window.prompt('Gullak username for ' + member.name + ':');
      if (!/^[a-z0-9_]{3,24}$/i.test(String(username || ''))) throw new Error('A valid Gullak username is required for ' + member.name + '.');
      const linked = await G.cloud.addFamilyMember(meta.cloudId, username, member.role);
      member.userId = linked.member.user_id;
    }
    await G.cloud.saveFamilyVault(meta.cloudId, raw, { meta, data: { v: 1, defaults: data.defaults || {}, createdAt: data.createdAt } });
    for (const member of meta.members.filter(x => x.role === 'member' && x.userId)) {
      if (data.kids[member.id]) await G.cloud.saveMemberVault(meta.cloudId, member.userId, raw, data.kids[member.id]);
    }
    const verify = await G.cloud.getFamilyVault(meta.cloudId, raw);
    if (!verify.value || !verify.value.meta || verify.value.meta.members.length !== meta.members.length) throw new Error('Cloud verification failed; existing family was kept.');
    if (replace) await G.cloud.deleteFamily(replace.family_id);
    familyCache.set(meta.cloudId, { meta, fkRaw: raw }); activeFamilyId = meta.cloudId; mode = 'family';
    G.FAM = { meta, fk: key, fkRaw: raw, data, mid: supervisor.id, role: 'supervisor', cloudId: meta.cloudId };
    await G.famSave();
    G.toast('Family backup imported. Share this new Family PIN with family members: ' + code, 10000);
    G.go('sup');
  }

  G.screens['cloud-families'].after = root => {
    if (!Array.isArray(G.cloudFamilyResults) && !G.cloudFamilyLoading) {
      G.cloudFamilyLoading = true;
      G.cloud.listFamilies().then(rows => { G.cloudFamilyResults = rows; })
        .catch(error => { G.cloudFamilyLoadError = error.message || 'Could not load your families.'; })
        .finally(() => {
          G.cloudFamilyLoading = false;
          if (G._last === 'cloud-families') G.render({ keepScroll: true });
        });
    }
    const input = G.$('#cloud-family-import-file', root);
    if (!input) return;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const modal = G.modal({ html: '<h2>Import encrypted family</h2><p class="small muted">Enter the backup-file passphrase.</p><input class="input" id="cloud-family-import-pass" type="password"><button class="btn primary block mt" data-act="import-cloud-family">Unlock and import</button>', handlers: {
          'import-cloud-family': async button => {
            const pass = G.$('#cloud-family-import-pass', modal.el).value;
            if (pass.length < 10) return G.toast('Enter the backup passphrase.');
            button.disabled = true;
            try { await importCloudFamilyBackup(String(reader.result), pass); modal.close(); }
            catch (e) { button.disabled = false; G.toast(e.message || 'Family import failed.'); }
          }
        }});
      };
      reader.readAsText(file);
    });
  };
  // Ensure cloud account login returns to family flow, and restore remote individual state.
  const cloudConnectScreen = G.screens['cloud-account'];
  const cloudConnectHandlers = cloudConnectScreen.handlers;
  cloudConnectScreen.handlers = () => {
    const handlers = cloudConnectHandlers();
    const connect = handlers['cloud-connect'];
    handlers['cloud-connect'] = async button => {
      const familyReturn = G.cloudFamilyReturn;
      await connect(button);
      if (G.cloudAccount.unlocked && G.pendingIndividualBackup && !wasFamily) {
        const restored = G.pendingIndividualBackup;
        if (mode !== 'individual') { G.toast('Switch to Individual mode to restore this backup.'); return; }
        const expectedUser = G.pendingIndividualBackupUsername;
        if (expectedUser && expectedUser.toLowerCase() !== String(G.cloudAccount.user.username || '').toLowerCase()) {
          G.toast('This backup belongs to ' + expectedUser + '. Sign in to that account or create it before restoring.');
          return;
        }
        const accountPassword = window.prompt('Enter your Gullak account password to replace this account:');
        if (!accountPassword) return;
        try {
          const reauth = await G.cloud.login(G.cloudAccount.user.username, accountPassword);
          if (!reauth.user || reauth.user.user_id !== G.cloudAccount.user.user_id) throw new Error('Account verification failed. No data was replaced.');
          await G.cloud.saveVault(restored, G.cloudAccount.encryptionPassphrase);
          const verify = await G.cloud.loadVault(G.cloudAccount.encryptionPassphrase);
          if (!verify || JSON.stringify(verify) !== JSON.stringify(restored)) throw new Error('Cloud verification failed. The existing diary was not replaced.');
          G.pendingIndividualBackup = null; G.pendingIndividualBackupUsername = '';
          G.backupTemporary = false; G.backupCreateAccount = false;
          G.S = G.normState(verify);
          G.toast('Backup restored and verified.');
          G.go('home');
        } catch (error) { G.toast(error.message || 'Backup restore failed.'); }
        return;
      }
      if (familyReturn && G.cloudAccount.unlocked) {
        G.cloudFamilyReturn = false;
        mode = 'family';
        if (familyReturn === 'member' && G.pendingFamilyMember) {
          const pending = G.pendingFamilyMember;
          G.pendingFamilyMember = null;
          try { await G.famUnlock(pending.familyId, pending.memberId); }
          catch (error) { G.toast(error.message || 'This Gullak account is not linked to that family member.'); G.go('fam-users', { f: pending.familyId }); }
          return;
        }
        const destination = familyReturn === 'create' ? 'fam-create' : familyReturn === 'open' ? 'cloud-families' : 'fam-pick';
        G.go(destination);
      }
    };
    return handlers;
  };

  // Backup and restore entry points live on the cloud login screen, not Settings.
  const accountScreen = G.screens['cloud-account'];
  const accountRender0 = accountScreen.render;
  accountScreen.render = (...args) => {
    let html = accountRender0(...args);
    if (mode === 'family') {
      // Family setup/login is not an Individual diary backup screen.
      html = html
        .replace('Your account password signs you in and unlocks your encrypted diary.', 'Sign in to your Gullak account to create or open your cloud family.')
        .replace('Log in & unlock my Gullak', 'Log in & continue to Family')
        .replace('New here? · Create an account', 'New to Gullak? · Create your account');
      // Family export belongs inside an already-open family; import belongs in Find a family.
      // Do not show a misleading, empty backup panel during family creation/login.
      return html;
    }
    const backupControls = `${G.cloudAccount.unlocked && G.S && G.S.profile ? '<button class="btn soft block" data-act="cloud-individual-export">Export Individual backup</button>' : ''}
          <label class="btn soft block file-btn mt">Import Individual backup<input id="cloud-individual-import-file" type="file" accept=".gullak,.json,application/json" hidden></label>`;
    const panel = `<section class="card"><h3>📦 Backups & restore</h3>
          <p class="small muted">Backups are encrypted with a separate passphrase. Restoring to the cloud requires the destination account to be unlocked.</p>
          ${backupControls}
        </section>`;
    return html.replace(
      '<p class="fine">🔐 Gullak syncs',
      `${panel}\n      <p class="fine">🔐 Gullak syncs`
    );
  };
  const accountHandlers0 = accountScreen.handlers;
  accountScreen.handlers = (...args) => Object.assign(accountHandlers0(...args), {
    'open-family-backups': () => { if (mode !== 'family') return G.toast('Switch to Family mode to restore a family backup.'); G.go('cloud-families'); },
    'export-family-backup': async () => {
      const F = G.FAM;
      if (!F || !G.cloudAccount.unlocked) return G.toast('Open and unlock the family first.');
      await G.famSave();
      const payload = { gullakFamily: 1, savedAt: G.now(), meta: F.meta, familyKey: C.b64(F.fkRaw), data: await C.encStr(F.fk, JSON.stringify(F.data)) };
      const m = G.modal({ html: '<h2>🔐 Export encrypted family backup</h2><p class="small muted">Choose a separate backup passphrase.</p><input class="input" id="family-backup-export-pass" type="password" placeholder="At least 10 characters"><input class="input" id="family-backup-export-confirm" type="password" placeholder="Confirm passphrase"><button class="btn primary block mt" data-act="make-family-backup">Create encrypted file</button>', handlers: {
        'make-family-backup': async button => {
          const pass = G.$('#family-backup-export-pass', m.el).value, confirm = G.$('#family-backup-export-confirm', m.el).value;
          if (pass.length < 10 || pass !== confirm) return G.toast('Use matching passphrases of at least 10 characters.');
          button.disabled = true;
          try { G.cloudBackup.download(await G.cloudBackup.encode(payload, pass)); m.close(); G.toast('Encrypted family export created.'); }
          catch (e) { button.disabled = false; G.toast(e.message || 'Export failed.'); }
        }
      }});
    },
    'cloud-individual-export': () => {
      if (G.backupTemporary) return G.toast('This temporary copy is not connected to an account. Sign in to export a cloud backup.');
      if (!G.cloudAccount.unlocked || !G.S.profile || mode !== 'individual') return G.toast('Log in to the Individual account first.');
      const m = G.modal({ html: '<h2>🔐 Export encrypted backup</h2><p class="small muted">Choose a separate backup passphrase.</p><input class="input" id="ind-export-pass" type="password" placeholder="At least 10 characters"><input class="input" id="ind-export-confirm" type="password" placeholder="Confirm passphrase"><button class="btn primary block mt" data-act="make-ind-export">Create backup</button>', handlers: {
        'make-ind-export': async button => {
          const pass = G.$('#ind-export-pass', m.el).value, confirm = G.$('#ind-export-confirm', m.el).value;
          if (pass.length < 10 || pass !== confirm) return G.toast('Use matching passphrases of at least 10 characters.');
          button.disabled = true;
          try {
            await G.waitForCloudSync();
            G.cloudBackup.download(await G.cloudBackup.encode({ gullakMode: 'individual', owner: { username: G.cloudAccount.user.username }, state: G.S }, pass));
            m.close();
          }
          catch (e) { button.disabled = false; G.toast(e.message || 'Export failed.'); }
        }
      }});
    }
  });
  const accountAfter0 = accountScreen.after;
  accountScreen.after = (root, q) => {
    if (accountAfter0) accountAfter0(root, q);
    const usernameInput = G.$('#cloud-username', root);
    if (usernameInput && G.pendingIndividualBackupUsername) usernameInput.value = G.pendingIndividualBackupUsername;
    const input = G.$('#cloud-individual-import-file', root);
    if (!input) return;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const modal = G.modal({ html: '<h2>🔐 Import encrypted backup</h2><p class="small muted">This replaces the signed-in Individual cloud diary after verification.</p><input class="input" id="ind-import-pass" type="password" placeholder="Backup passphrase"><button class="btn primary block mt" data-act="unlock-ind-import">Unlock and review</button>', handlers: {
          'unlock-ind-import': async button => {
            button.disabled = true;
            try {
              const payload = await G.cloudBackup.decode(String(reader.result), G.$('#ind-import-pass', modal.el).value);
              if (!payload || payload.gullakMode !== 'individual' || !payload.state || !payload.state.profile) throw new Error('This is not an Individual Gullak backup.');
              const value = G.normState(payload.state);
              const owner = payload.owner && typeof payload.owner.username === 'string' ? payload.owner.username : '';
              if (G.cloudAccount.unlocked && mode === 'individual' &&
                  !!owner && owner.toLowerCase() === String(G.cloudAccount.user.username || '').toLowerCase()) {
                const accountPassword = window.prompt('Enter your Gullak account password to replace this account:');
                if (!accountPassword) { button.disabled = false; return; }
                const reauth = await G.cloud.login(G.cloudAccount.user.username, accountPassword);
                if (!reauth.user || reauth.user.user_id !== G.cloudAccount.user.user_id) throw new Error('Account verification failed. No data was replaced.');
                await G.cloud.saveVault(value, G.cloudAccount.encryptionPassphrase);
                const verify = await G.cloud.loadVault(G.cloudAccount.encryptionPassphrase);
                if (!verify || JSON.stringify(verify) !== JSON.stringify(value)) throw new Error('Cloud verification failed. The current diary has not been replaced.');
                G.backupTemporary = false;
                G.S = value; modal.close(); G.toast('Backup imported and verified.'); G.go('home');
                return;
              }
              G.pendingIndividualBackup = value;
              G.pendingIndividualBackupUsername = owner;
              modal.close();
              const choice = G.modal({ html:
                '<h2>📦 Backup unlocked</h2><p class="small muted">' +
                (owner ? 'This backup belongs to <b>' + G.esc(owner) + '</b>.' : 'This backup does not contain an account username.') +
                ' Sign in to restore it to the cloud, create the account if needed, or open an editable temporary copy. Changes exist only in this tab’s memory and disappear when you leave or reload.</p>' +
                '<button class="btn primary block" data-act="backup-sign-in">Sign in to existing account</button>' +
                '<button class="btn soft block mt" data-act="backup-create-account">Create account</button>' +
                '<button class="btn ghost block mt" data-act="backup-read-only">Open editable temporary copy</button>' +
                '<button class="btn ghost block mt" data-act="backup-cancel">Cancel</button>',
                handlers: {
                  'backup-sign-in': () => { choice.close(); G.backupTemporary = false; mode = 'individual'; G.setMode('individual'); G.go('cloud-account'); },
                  'backup-create-account': () => {
                    choice.close(); G.backupTemporary = false; mode = 'individual'; G.setMode('individual');
                    G.backupCreateAccount = true;
                    G.go('cloud-account');
                    if (G.cloudAccount.setAuthMode) G.cloudAccount.setAuthMode('register');
                  },
                  'backup-read-only': () => {
                    choice.close(); G.backupTemporary = true; G.setMode('individual'); G.S = value;
                    G.go('home'); G.toast('Temporary copy opened. You can edit it, but nothing will be saved anywhere. It disappears when you leave or reload.');
                  },
                  'backup-cancel': () => { choice.close(); G.pendingIndividualBackup = null; G.pendingIndividualBackupUsername = ''; }
                }
              });
            } catch (e) { button.disabled = false; G.toast(e.message || 'Import failed.'); }
          }
        }});
      };
      reader.readAsText(file);
    });
  };

  // Family backup export uses the in-memory cloud family data, never a local ciphertext cache.
  const sup = G.screens.sup, supHandlers = sup.handlers;
  sup.handlers = () => Object.assign(supHandlers(), {
    'f-export': async () => {
      const F = G.FAM;
      if (!F || !G.cloudAccount.unlocked) return G.toast('Unlock your cloud account first.');
      await G.famSave();
      const payload = { gullakFamily: 1, savedAt: G.now(), meta: F.meta, data: await C.encStr(F.fk, JSON.stringify(F.data)) };
      const modal = G.modal({ html: '<h2>🔐 Export encrypted family backup</h2><p class="small muted">Choose a separate backup passphrase.</p><input class="input" id="family-backup-export-pass" type="password" placeholder="At least 10 characters"><input class="input" id="family-backup-export-confirm" type="password" placeholder="Confirm passphrase"><button class="btn primary block mt" data-act="make-family-backup">Create encrypted file</button>', handlers: {
        'make-family-backup': async button => {
          const pass = G.$('#family-backup-export-pass', modal.el).value, confirm = G.$('#family-backup-export-confirm', modal.el).value;
          if (pass.length < 10 || pass !== confirm) return G.toast('Use matching passphrases of at least 10 characters.');
          button.disabled = true;
          try { G.cloudBackup.download(await G.cloudBackup.encode(payload, pass)); modal.close(); G.toast('Encrypted family export created.'); }
          catch (e) { button.disabled = false; G.toast(e.message || 'Export failed.'); }
        }
      }});
    }
  });


  // Keep account logout from leaving decrypted family records in memory.
  const logout0 = G.cloudAccount.logout;
  G.cloudAccount.logout = async () => {
    await G.waitForCloudSync().catch(() => {});
    G.FAM = null; familyCache.clear(); activeFamilyId = null;
    G.S = G.fresh(); mode = 'individual';
    return logout0();
  };
  // Restore a remembered device session before the first page is rendered.
  const priorBootReady = G.bootReady;
  G.bootReady = Promise.resolve(priorBootReady).then(async () => {
    if (G.cloudAccount && !G.cloudAccount.unlocked) await G.cloudAccount.restoreSession();
  });

})(window.G);
