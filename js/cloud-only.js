/* Cloud-only storage and recovery layer. Loaded after cloud-ui.js. */
(function (G) {
  'use strict';
  const C = G.cr;
  let mode = 'individual';
  const familyCache = new Map();
  let activeFamilyId = null;
  const safeCopy = value => JSON.parse(JSON.stringify(value));
  const familyKey = key => /^gullak:(families|famdata:|lastfam|mode|famsession)/.test(String(key));

  // Family indexes, family ciphertext and mode selection are memory-only.
  const ls = window.localStorage;
  const ss = window.sessionStorage;
  if (ls && !ls.__gullakCloudOnly) {
    const get = ls.getItem.bind(ls), set = ls.setItem.bind(ls), remove = ls.removeItem.bind(ls);
    Object.defineProperty(ls, '__gullakCloudOnly', { value: true });
    ls.getItem = key => familyKey(key) ? null : get(key);
    ls.setItem = (key, value) => familyKey(key) ? undefined : set(key, value);
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

  // Never fall back to browser persistence. An unavailable cloud session is a visible error.
  const cloudSave0 = G.save;
  let individualChain = Promise.resolve();
  G.save = function () {
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
    if (!F || !F.cloudId) throw new Error('Cloud family creation did not finish.');
    familyCache.set(F.cloudId, { meta: F.meta, fkRaw: F.fkRaw });
    await G.famSave();
    return code;
  };

  G.famUnlock = async (familyId, memberId, pin) => {
    const cached = familyCache.get(familyId) || (G.FAM && G.FAM.meta.id === familyId ? { meta: G.FAM.meta, fkRaw: G.FAM.fkRaw } : null);
    if (!cached) throw new Error('Choose or join this cloud family first.');
    const member = cached.meta.members.find(m => m.id === memberId);
    if (!member) throw new Error('Family member not found.');
    let raw;
    try { raw = await C.unwrapWithSecret(pin, member.salt, member.wrap, cached.meta.iter); }
    catch (_) { throw new Error('That PIN is not correct.'); }
    if (!cached.meta.cloudId) throw new Error('This family is not connected to Gullak Cloud.');
    await loadFamily(cached, raw, memberId);
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
    render: () => '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="modes">←</button><h1>👨‍👩‍👧 Cloud families</h1></header><section class="card"><button class="btn primary block" data-act="open-cloud-families">☁️ Find / open a family</button><button class="btn soft block mt" data-act="new-cloud-family">➕ Create a family</button></section></section>',
    handlers: () => ({
      'open-cloud-families': () => {
        mode = 'family';
        if (!G.cloudAccount.unlocked) { G.cloudFamilyReturn = true; G.go('cloud-account'); }
        else G.go('cloud-families');
      },
      'new-cloud-family': () => {
        mode = 'family';
        if (!G.cloudAccount.unlocked) { G.cloudFamilyReturn = true; G.go('cloud-account'); }
        else G.go('fam-create');
      }
    })
  };

  const famUsers = G.screens['fam-users'];
  G.screens['fam-users'] = {
    bare: true,
    render: q => {
      const cached = familyCache.get(q.f) || (G.FAM && G.FAM.meta.id === q.f ? { meta: G.FAM.meta, fkRaw: G.FAM.fkRaw } : null);
      const meta = cached && cached.meta;
      if (!meta) return '<section class="card"><p>Open this family from Cloud families first.</p><button class="btn primary block" data-act="go" data-to="cloud-families">Find family</button></section>';
      return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-pick">←</button><h1>' + G.esc(meta.emoji || '👨‍👩‍👧') + ' ' + G.esc(meta.name) + '</h1></header><section class="card"><h2>Who are you?</h2>' +
        meta.members.map(m => '<button class="kid-row block" data-act="choose-member" data-mid="' + G.esc(m.id) + '"><span class="av-mid">' + G.esc(m.avatar) + '</span><b>' + G.esc(m.name) + '</b><small>' + (m.role === 'supervisor' ? 'Supervisor' : 'Member') + '</small></button>').join('') +
        '</section></section>';
    },
    handlers: () => ({ 'choose-member': el => G.go('fam-pin', { f: activeFamilyId, m: el.dataset.mid }) })
  };
  G.screens['fam-pin'] = {
    bare: true,
    render: q => '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-users">←</button><h1>🔒 Family PIN</h1></header><section class="card"><label class="label">Enter your 4–6 digit PIN</label><input class="input big" id="cloud-family-pin" type="password" inputmode="numeric" maxlength="6"><button class="btn primary block big" data-act="unlock-cloud-family">Unlock family</button></section></section>',
    handlers: () => ({ 'unlock-cloud-family': async button => {
      const q = new URLSearchParams(location.hash.split('?')[1] || '');
      const familyId = q.get('f') || activeFamilyId, memberId = q.get('m');
      const pin = G.$('#cloud-family-pin').value;
      if (!/^\d{4,6}$/.test(pin)) return G.toast('Enter a 4–6 digit PIN.');
      button.disabled = true;
      try { await G.famUnlock(familyId, memberId, pin); }
      catch (error) { button.disabled = false; G.toast(error.message || 'Could not unlock family.'); }
    } })
  };

  // Joining obtains the encrypted metadata, then keeps it in memory only.
  G.screens['cloud-family-join'].handlers = () => ({
    'family-join': async button => {
      if (!G.cloudAccount.unlocked || !G.selectedCloudFamily) return G.toast('Log in and choose a family first.');
      const code = G.$('#cloud-family-code').value.trim();
      if (code.length < 8) return G.toast('Enter the family recovery code.');
      button.disabled = true;
      try {
        const joined = await G.cloud.joinFamily(G.selectedCloudFamily.id, code);
        const meta = joined.value && joined.value.meta;
        if (!meta || !Array.isArray(meta.members)) throw new Error('Family metadata is invalid.');
        const member = meta.members.find(m => m.userId === G.cloudAccount.user.user_id);
        if (!member) throw new Error('Your Gullak account has not been linked to a family member. Ask a supervisor to link your username.');
        meta.cloudId = G.selectedCloudFamily.id;
        const data = joined.value.data || {};
        const cache = { meta, fkRaw: joined.familyKeyRaw };
        familyCache.set(meta.cloudId, cache); activeFamilyId = meta.cloudId;
        G.FAM = { meta, fk: await C.aesKey(joined.familyKeyRaw), fkRaw: joined.familyKeyRaw,
          data: { v: 1, kids: {}, sups: {}, defaults: data.defaults || {} }, mid: member.id, role: member.role, cloudId: meta.cloudId };
        await loadFamily(cache, joined.familyKeyRaw, member.id);
      } catch (error) { button.disabled = false; G.toast(error.message || 'Could not join family.'); }
    }
  });
  G.screens['cloud-family-join'].render = () => '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>🔐 Join family</h1></header><section class="card"><h2>' + G.esc(G.selectedCloudFamily && G.selectedCloudFamily.name || 'Family') + '</h2><label class="label">Family recovery / invite code</label><input class="input" id="cloud-family-code" maxlength="40" autocomplete="off"><button class="btn primary block big" data-act="family-join">Join and unlock</button></section></section>';

  const originalCloudFamilies = G.screens['cloud-families'];
  const oldSelect = originalCloudFamilies.handlers;
  G.screens['cloud-families'].handlers = () => ({
    'cloud-login': () => G.go('cloud-account'),
    'family-search': async () => {
      const q = G.$('#cloud-family-query').value.trim();
      if (q.length < 2) return G.toast('Type at least 2 characters.');
      try { G.cloudFamilyResults = await G.cloud.searchFamilies(q); G.render({ keepScroll: true }); }
      catch (e) { G.toast(e.message || 'Search failed.'); }
    },
    'family-select': el => { G.selectedCloudFamily = { id: el.dataset.id, name: el.dataset.name }; G.go('cloud-family-join'); },
    'family-refresh': async () => {
      try { G.cloudFamilyResults = await G.cloud.listFamilies(); G.render({ keepScroll: true }); }
      catch (e) { G.toast(e.message || 'Could not load families.'); }
    }
  });
  G.screens['cloud-families'].render = () => {
    const rows = (G.cloudFamilyResults || []).map(f => '<div class="kid-row"><div class="grow"><b>' + G.esc(f.name) + '</b><small>' + (f.is_member || f.role ? 'Your family' : 'Invite code required') + '</small></div><button class="btn small soft" data-act="family-select" data-id="' + G.esc(f.family_id) + '" data-name="' + G.esc(f.name) + '">Open</button></div>').join('');
    return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-pick">←</button><h1>☁️ Cloud families</h1></header><section class="card"><input class="input" id="cloud-family-query" maxlength="64" placeholder="Family name or invite code"><button class="btn primary block mt" data-act="family-search">Search</button><div class="col gap mt">' + (rows || '<p class="muted small">Search for a family or refresh your list.</p>') + '</div><button class="btn soft block mt" data-act="family-refresh">Refresh my families</button></section></section>';
  };


  async function importCloudFamilyBackup(rawText, backupPass) {
    const payload = await G.cloudBackup.decode(rawText, backupPass);
    if (!payload || payload.gullakFamily !== 1 || !payload.meta || !Array.isArray(payload.meta.members) || typeof payload.data !== 'string') throw new Error('Invalid Family backup.');
    const meta = safeCopy(payload.meta);
    const recovery = window.prompt('Enter the family recovery code saved with this backup:');
    if (!recovery) throw new Error('Family recovery code is required.');
    const raw = await C.unwrapWithSecret(C.normCode(recovery), meta.rc.salt, meta.rc.wrap, meta.iter);
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
    const code = C.recoveryCode(), salt = C.salt();
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
    G.toast('Family backup imported. Save this new recovery code: ' + code, 8000);
    G.go('sup');
  }

  G.screens['cloud-families'].after = root => {
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
      const wasFamily = !!G.cloudFamilyReturn;
      await connect(button);
      if (wasFamily && G.cloudAccount.unlocked) {
        G.cloudFamilyReturn = false;
        mode = 'family';
        G.go('cloud-families');
      }
    };
    return handlers;
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


  // Individual encrypted export/import. Import is always an explicit replacement
  // of the currently authenticated account's cloud vault and is verified before use.
  const settingsScreen = G.screens.settings;
  if (settingsScreen) {
    const settingsRender0 = settingsScreen.render;
    settingsScreen.render = (...args) => settingsRender0(...args) +
      '<section class="card"><h3>📦 Cloud backup</h3><p class="small muted">Export creates an encrypted file. Import replaces the currently signed-in account diary only after confirmation and cloud verification.</p><button class="btn soft block" data-act="cloud-individual-export">Export encrypted Individual backup</button><label class="btn ghost block file-btn">Import Individual backup<input id="cloud-individual-import-file" type="file" accept=".gullak,.json,application/json" hidden></label></section>';
    const settingsHandlers0 = settingsScreen.handlers;
    settingsScreen.handlers = (...args) => Object.assign(settingsHandlers0 ? settingsHandlers0(...args) : {}, {
      'cloud-individual-export': () => {
        if (mode !== 'individual' || !G.cloudAccount.unlocked || !G.S.profile) return G.toast('Unlock your Individual cloud account first.');
        const modal = G.modal({ html: '<h2>🔐 Export encrypted backup</h2><p class="small muted">Choose a separate backup passphrase.</p><input class="input" id="ind-export-pass" type="password" placeholder="At least 10 characters"><input class="input" id="ind-export-confirm" type="password" placeholder="Confirm passphrase"><button class="btn primary block mt" data-act="make-ind-export">Create backup</button>', handlers: {
          'make-ind-export': async button => {
            const pass = G.$('#ind-export-pass', modal.el).value, confirm = G.$('#ind-export-confirm', modal.el).value;
            if (pass.length < 10 || pass !== confirm) return G.toast('Use matching passphrases of at least 10 characters.');
            button.disabled = true;
            try { const text = await G.cloudBackup.encode({ gullakMode: 'individual', state: G.S }, pass); G.cloudBackup.download(text); modal.close(); }
            catch (e) { button.disabled = false; G.toast(e.message || 'Export failed.'); }
          }
        }});
      }
    });
    const after0 = settingsScreen.after;
    settingsScreen.after = (root, q) => {
      if (after0) after0(root, q);
      const input = G.$('#cloud-individual-import-file', root);
      if (!input) return;
      input.addEventListener('change', () => {
        const file = input.files && input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const modal = G.modal({ html: '<h2>🔐 Import encrypted backup</h2><p class="small muted">This will replace the diary in the signed-in Gullak account after verification.</p><input class="input" id="ind-import-pass" type="password" placeholder="Backup passphrase"><button class="btn primary block mt" data-act="unlock-ind-import">Unlock and review</button>', handlers: {
            'unlock-ind-import': async button => {
              const pass = G.$('#ind-import-pass', modal.el).value;
              button.disabled = true;
              try {
                const payload = await G.cloudBackup.decode(String(reader.result), pass);
                if (!payload || payload.gullakMode !== 'individual' || !payload.state || !payload.state.profile) throw new Error('This is not an Individual Gullak backup.');
                if (!G.cloudAccount.unlocked || mode !== 'individual') throw new Error('Log in to the Individual cloud account first.');
                if (!(await G.confirm('Replace this account diary?', 'The imported backup will replace the current cloud diary for @' + G.cloudAccount.user.username + '. Export the current diary first if you want to keep it.', 'Replace cloud diary', 'Cancel'))) { button.disabled = false; return; }
                const value = G.normState(payload.state);
                await G.cloud.saveVault(value, G.cloudAccount.encryptionPassphrase);
                const verify = await G.cloud.loadVault(G.cloudAccount.encryptionPassphrase);
                if (!verify || JSON.stringify(verify) !== JSON.stringify(value)) throw new Error('Cloud verification failed. The current diary has not been replaced in this browser.');
                G.S = value;
                try { localStorage.removeItem('gullak:v1'); } catch (_) {}
                modal.close(); G.toast('☁️ Backup imported and verified in your cloud account.'); G.go('home');
              } catch (e) { button.disabled = false; G.toast(e.message || 'Import failed.'); }
            }
          }});
        };
        reader.readAsText(file);
      });
    };
  }

  // Keep account logout from leaving decrypted family records in memory.
  const logout0 = G.cloudAccount.logout;
  G.cloudAccount.logout = async () => {
    await G.waitForCloudSync().catch(() => {});
    G.FAM = null; familyCache.clear(); activeFamilyId = null;
    G.S = G.fresh(); mode = 'individual';
    return logout0();
  };
})(window.G);
