/* Cloud account UI + encrypted individual-vault sync.
   Local data is deliberately retained during this migration phase. */
(function (G) {
  const esc = G.esc;
  let authMode = 'login';
  let cloudSecret = '';
  let cloudUser = null;
  let syncChain = Promise.resolve();
  let syncError = null;
  let familyResults = [];
  let selectedFamily = null;
  let returnAfterLogin = null;

  G.cloudAccount = {
    get user() { return cloudUser; },
    get encryptionPassphrase() { return cloudSecret; },
    get unlocked() { return !!cloudSecret && !!cloudUser; },
    get status() { return syncError ? 'error' : (cloudSecret ? 'connected' : 'locked'); },
    async logout() {
      try {
        await syncChain.catch(() => {});
        await familySyncChain.catch(() => {});
        await G.cloud.logout();
      } finally {
        cloudSecret = ''; cloudUser = null; syncError = null;
      }
    }
  };

  // Preserve the existing local save and family-mode behavior for now.
  const saveBeforeCloud = G.save;
  G.save = function () {
    saveBeforeCloud();
    if (G.mode && G.mode() === 'family') return;
    if (!cloudSecret || !cloudUser || !G.S || !G.S.profile) return;
    const snapshot = JSON.parse(JSON.stringify(G.S));
    syncChain = syncChain.catch(() => {}).then(() => G.cloud.saveVault(snapshot, cloudSecret))
      .then(() => { syncError = null; })
      .catch(error => {
        syncError = error;
        console.error('Gullak cloud save failed:', error);
      });
  };
  G.waitForCloudSync = () => syncChain;

  const normalize = value => typeof G.normState === 'function' ? G.normState(value) : Object.assign(G.fresh(), value || {});
  const localIndividual = () => {
    try {
      const value = JSON.parse(localStorage.getItem('gullak:v1'));
      return value && value.profile ? normalize(value) : null;
    } catch (_) { return null; }
  };

  G.FREE_ROUTES = G.FREE_ROUTES || ['welcome', 'parent', 'reply'];
  ['cloud-account', 'cloud-families', 'cloud-family-join'].forEach(route => {
    if (!G.FREE_ROUTES.includes(route)) G.FREE_ROUTES.push(route);
  });

  G.screens['cloud-account'] = {
    bare: true,
    render: () => `<section class="ob">
      <header class="page-h"><button class="back" data-act="go" data-to="${G.S.profile ? 'settings' : 'welcome'}" aria-label="Back">←</button><h1>☁️ Gullak Cloud</h1></header>
      <div class="card">
        <h2>${authMode === 'register' ? 'Create your cloud account' : 'Log in to Gullak'}</h2>
        <p class="small muted">Your account password signs you in. Your separate encryption passphrase locks your money diary. The passphrase is used only in this browser and is never sent to the server.</p>
        <label class="label" for="cloud-username">Username</label>
        <input class="input" id="cloud-username" maxlength="24" autocomplete="username" placeholder="3–24 letters, numbers or _">
        <label class="label" for="cloud-password">Account password</label>
        <input class="input" id="cloud-password" type="password" maxlength="128" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}" placeholder="At least 10 characters">
        <label class="label" for="cloud-secret">Separate encryption passphrase</label>
        <input class="input" id="cloud-secret" type="password" maxlength="256" autocomplete="off" placeholder="Do not reuse your account password">
        ${authMode === 'register' ? '<label class="label" for="cloud-secret-confirm">Confirm encryption passphrase</label><input class="input" id="cloud-secret-confirm" type="password" maxlength="256" autocomplete="off" placeholder="Type it again">' : ''}
        <p class="hint">Keep this passphrase safe. If you lose it, the server cannot recover your encrypted diary.</p>
        <button class="btn primary block big" data-act="cloud-connect">${authMode === 'register' ? 'Create account & secure my Gullak' : 'Log in & unlock my Gullak'}</button>
        <button class="btn ghost block" data-act="cloud-mode">${authMode === 'register' ? 'I already have an account · Log in' : 'New here? · Create an account'}</button>
      </div>
      <p class="fine">🔐 Only encrypted vault data is uploaded. Your existing on-device data is not deleted in this step.</p>
    </section>`,
    handlers: () => ({
      'cloud-mode': () => { authMode = authMode === 'login' ? 'register' : 'login'; G.render(); },
      'cloud-connect': async (button) => {
        const username = G.$('#cloud-username').value.trim();
        const password = G.$('#cloud-password').value;
        const secret = G.$('#cloud-secret').value;
        if (!/^[a-z0-9_]{3,24}$/i.test(username)) return G.toast('Username must be 3–24 letters, numbers or underscores.');
        if (authMode === 'register' && password.length < 10) return G.toast('Account password must be at least 10 characters.');
        if (!password || password.length > 128) return G.toast('Enter your account password.');
        if (secret.length < 10) return G.toast('Encryption passphrase must be at least 10 characters.');
        if (authMode === 'register' && secret !== G.$('#cloud-secret-confirm').value) return G.toast('The encryption passphrases do not match.');
        if (!G.cr || !G.cr.available) return G.toast('Secure browser encryption is unavailable. Open Gullak over HTTPS.');
        button.disabled = true; button.textContent = '🔐 Connecting…';
        try {
          const auth = authMode === 'register'
            ? await G.cloud.register(username, password)
            : await G.cloud.login(username, password);
          cloudUser = auth.user;
          cloudSecret = secret;
          syncError = null;
          const familyReturn = G.mode && G.mode() === 'family' &&
            ['sup', 'fam-create', 'fam-pick', 'cloud-families', 'cloud-family-join'].includes(returnAfterLogin);
          if (familyReturn) {
            G.go(returnAfterLogin);
            return;
          }
          const remote = await G.cloud.loadVault(secret);
          if (G.mode) G.setMode('individual');
          if (remote) {
            G.S = normalize(remote);
            G.save();
            await G.waitForCloudSync();
            G.toast('☁️ Your encrypted Gullak is unlocked.');
            G.go(returnAfterLogin || 'home');
            return;
          }
          const local = localIndividual();
          if (local) {
            const migrate = await G.confirm(
              'Upload this Gullak?',
              'This account has no cloud diary yet. Upload the current on-device Gullak as an encrypted vault? Your local copy will remain untouched.',
              'Encrypt & upload', 'Not now'
            );
            if (migrate) {
              G.S = local;
              await G.cloud.saveVault(local, cloudSecret);
              G.toast('☁️ Your existing Gullak is now encrypted in the cloud.');
              G.go(returnAfterLogin || 'home');
            } else {
              G.toast('Cloud account connected. Your on-device data has not been changed.');
              G.go(returnAfterLogin || 'home');
            }
          } else {
            G.S = G.fresh();
            G.go(returnAfterLogin || 'welcome');
            G.toast('Account ready. Set up your Gullak next.');
          }
        } catch (error) {
          cloudSecret = ''; cloudUser = null;
          G.toast(error.message || 'Could not connect to Gullak Cloud.');
        } finally {
          button.disabled = false;
          button.textContent = authMode === 'register' ? 'Create account & secure my Gullak' : 'Log in & unlock my Gullak';
        }
      }
    })
  };



  G.cloudBackup = {
    async encode(value, passphrase) {
      if (!G.cr || !G.cr.available) throw new Error('Secure encryption is unavailable.');
      if (typeof passphrase !== 'string' || passphrase.length < 10) throw new Error('Backup passphrase must be at least 10 characters.');
      const salt = G.cr.salt();
      const key = await G.cr.deriveKey(passphrase, salt, 310000);
      const packed = await G.cr.enc(key, new TextEncoder().encode(JSON.stringify(value)));
      const split = packed.indexOf('.');
      return JSON.stringify({
        format: 'gullak-encrypted-backup', version: 1, kdf: 'PBKDF2-SHA256',
        iterations: 310000, salt, iv: packed.slice(0, split), ciphertext: packed.slice(split + 1)
      });
    },
    async decode(text, passphrase) {
      let file;
      try { file = JSON.parse(text); } catch (_) { throw new Error('This is not a valid Gullak backup file.'); }
      if (!file || file.format !== 'gullak-encrypted-backup' || file.version !== 1 ||
          file.kdf !== 'PBKDF2-SHA256' || file.iterations !== 310000 ||
          !file.salt || !file.iv || !file.ciphertext) throw new Error('Unsupported or invalid encrypted backup.');
      const key = await G.cr.deriveKey(passphrase, file.salt, file.iterations);
      const value = JSON.parse(await G.cr.decStr(key, file.iv + '.' + file.ciphertext));
      if (!value || typeof value !== 'object') throw new Error('The decrypted backup is invalid.');
      return value;
    },
    download(text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'gullak-encrypted-backup.gullak'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };

  G.screens['cloud-families'] = {
    bare: true,
    render: () => {
      if (!G.cloudAccount.unlocked) return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-account">←</button><h1>☁️ Cloud families</h1></header><section class="card"><p>Log in and unlock your cloud account first.</p><button class="btn primary block" data-act="cloud-login">Log in</button></section></section>';
      const rows = familyResults.map(f => '<div class="kid-row"><div class="grow"><b>' + esc(f.name) + '</b><small>' + (f.is_member ? 'Already a member' : 'Invite code required') + '</small></div><button class="btn small soft" data-act="family-select" data-id="' + esc(f.family_id) + '" data-name="' + esc(f.name) + '">Open</button></div>').join('');
      return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-pick">←</button><h1>☁️ Cloud families</h1></header><section class="card"><h2>Find a family</h2><p class="small muted">Search by family name or invite code. Joining requires the family recovery/invite code.</p><input class="input" id="cloud-family-query" maxlength="64" placeholder="Family name or code"><button class="btn primary block mt" data-act="family-search">Search families</button><div class="col gap mt">' + (rows || '<p class="muted small">No search results yet.</p>') + '</div></section><section class="card"><h3>Your cloud families</h3><button class="btn soft block" data-act="family-refresh">Refresh my families</button></section></section>';
    },
    handlers: () => ({
      'cloud-login': () => { returnAfterLogin = 'cloud-families'; authMode = 'login'; G.go('cloud-account'); },
      'family-search': async () => {
        const q = G.$('#cloud-family-query').value.trim();
        if (q.length < 2) return G.toast('Type at least 2 characters to search.');
        try { familyResults = await G.cloud.searchFamilies(q); G.render({ keepScroll: true }); }
        catch (e) { G.toast(e.message || 'Family search failed.'); }
      },
      'family-select': el => { selectedFamily = { id: el.dataset.id, name: el.dataset.name }; G.go('cloud-family-join'); },
      'family-refresh': async () => {
        try { const list = await G.cloud.listFamilies(); familyResults = list.map(f => ({ ...f, is_member: 1 })); G.render({ keepScroll: true }); }
        catch (e) { G.toast(e.message || 'Could not load your families.'); }
      }
    })
  };

  G.screens['cloud-family-join'] = {
    bare: true,
    render: () => '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>🔐 Join family</h1></header><section class="card"><h2>' + esc(selectedFamily ? selectedFamily.name : 'Family') + '</h2><p class="small muted">Enter the family recovery/invite code. It unlocks the family encryption key in this browser.</p><label class="label" for="cloud-family-code">Family code</label><input class="input" id="cloud-family-code" maxlength="40" autocomplete="off" placeholder="GULL-XXXX-XXXX-XXXX-XXXX"><button class="btn primary block big" data-act="family-join">Join and unlock</button></section></section>',
    handlers: () => ({
      'family-join': async button => {
        if (!selectedFamily || !G.cloudAccount.unlocked) return G.toast('Log in to your cloud account first.');
        const code = G.$('#cloud-family-code').value.trim();
        if (code.length < 8) return G.toast('Enter the family code.');
        button.disabled = true; button.textContent = '🔐 Unlocking family…';
        try {
          const joined = await G.cloud.joinFamily(selectedFamily.id, code);
          const value = joined.value;
          if (!value || !value.meta || !Array.isArray(value.meta.members)) throw new Error('The family vault could not be opened.');
          const meta = value.meta;
          const accountId = G.cloudAccount.user.user_id;
          const member = meta.members.find(m => m.userId === accountId);
          if (!member) throw new Error('Your account is not linked to a family member yet. Ask a supervisor to add your Gullak username first.');
          meta.cloudId = selectedFamily.id;
          const data = value.data && typeof value.data === 'object' ? value.data : { v: 1, kids: {}, sups: {} };
          data.kids = data.kids || {}; data.sups = data.sups || {};
          if (member.role === 'supervisor') {
            for (const m of meta.members.filter(x => x.role === 'member' && x.userId)) {
              const row = await G.cloud.getMemberVault(selectedFamily.id, m.userId, joined.familyKeyRaw);
              if (row.exists) data.kids[m.id] = row.value;
            }
          } else {
            const row = await G.cloud.getMemberVault(selectedFamily.id, accountId, joined.familyKeyRaw);
            if (row.exists) data.kids[member.id] = row.value;
          }
          const index = (() => { try { return JSON.parse(localStorage.getItem('gullak:families')) || { list: [] }; } catch (_) { return { list: [] }; } })();
          index.list = index.list.filter(x => x.id !== meta.id); index.list.push(meta);
          localStorage.setItem('gullak:families', JSON.stringify(index));
          const key = await G.cr.aesKey(joined.familyKeyRaw);
          localStorage.setItem('gullak:famdata:' + meta.id, await G.cr.encStr(key, JSON.stringify(data)));
          localStorage.setItem('gullak:mode', 'family'); localStorage.setItem('gullak:lastfam', meta.id);
          G.setMode('family');
          G.go('fam-pin', { f: meta.id, m: member.id });
          G.toast('Cloud family loaded. Enter your family PIN to continue.');
        } catch (e) { G.toast(e.message || 'Could not join this family.'); }
        finally { button.disabled = false; button.textContent = 'Join and unlock'; }
      }
    })
  };

  // Add a cloud entry point without replacing any existing screen or handler.
  const welcome = G.screens.welcome;
  if (welcome) {
    const renderWelcome = welcome.render;
    welcome.render = (...args) => {
      const html = renderWelcome(...args);
      if (html.includes('data-act="cloud-open"')) return html;
      return html.replace('</section>', '<button class="btn ghost block" data-act="cloud-open">☁️ Cloud account · Log in / Sign up</button></section>');
    };
    const handlersWelcome = welcome.handlers;
    welcome.handlers = (...args) => Object.assign(handlersWelcome ? handlersWelcome(...args) : {}, {
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); }
    });
  }


  const persistCloudFamilyMeta = meta => {
    let index = { list: [] };
    try { index = JSON.parse(localStorage.getItem('gullak:families')) || index; } catch (_) {}
    index.list = index.list.filter(item => item.id !== meta.id);
    index.list.push(meta);
    localStorage.setItem('gullak:families', JSON.stringify(index));
  };

  let familySyncChain = Promise.resolve();
  const saveFamilyLocal = G.famSave;
  G.famSave = function () {
    const F = G.FAM;
    const localSave = saveFamilyLocal ? saveFamilyLocal() : Promise.resolve();
    if (!F || !F.cloudId || !G.cloudAccount.unlocked) return localSave;
    familySyncChain = familySyncChain.catch(() => {}).then(async () => {
      await localSave;
      if (F.role === 'supervisor') {
        await G.cloud.saveFamilyVault(F.cloudId, F.fkRaw, {
          meta: F.meta,
          data: { v: 1, defaults: F.data.defaults || {}, createdAt: F.data.createdAt }
        });
        for (const member of F.meta.members.filter(m => m.role === 'member' && m.userId)) {
          const state = F.data.kids[member.id];
          if (state) await G.cloud.saveMemberVault(F.cloudId, member.userId, F.fkRaw, state);
        }
      } else {
        const user = G.cloudAccount.user;
        if (!user || !F.meta.members.some(m => m.id === F.mid && m.userId === user.user_id)) {
          throw new Error('This cloud account is not linked to the selected family member.');
        }
        await G.cloud.saveMemberVault(F.cloudId, user.user_id, F.fkRaw, G.S);
      }
      syncError = null;
    }).catch(error => {
      syncError = error;
      console.error('Gullak family cloud sync failed:', error);
      G.toast('Family cloud sync failed. Your local encrypted copy is still here.');
      return false;
    });
    return familySyncChain;
  };

  const createFamilyLocal = G.famCreate;
  G.famCreate = async args => {
    if (!G.cloudAccount.unlocked) throw new Error('Log in to a Gullak Cloud account before creating a cloud family.');
    const code = await createFamilyLocal(args);
    const F = G.FAM;
    const supervisor = F.meta.members.find(m => m.role === 'supervisor');
    supervisor.userId = G.cloudAccount.user.user_id;
    const remote = await G.cloud.createFamily({
      name: F.meta.name, joinCode: code, familyKeyRaw: F.fkRaw,
      value: { meta: F.meta, data: { v: 1, defaults: F.data.defaults || {}, createdAt: F.data.createdAt } }
    });
    F.cloudId = remote.family_id;
    F.meta.cloudId = remote.family_id;
    persistCloudFamilyMeta(F.meta);
    await G.famSave();
    return code;
  };

  const unlockFamilyLocal = G.famUnlock;
  G.famUnlock = async (familyId, memberId, pin) => {
    await unlockFamilyLocal(familyId, memberId, pin);
    const F = G.FAM;
    if (!F || !F.meta.cloudId) return;
    if (!G.cloudAccount.unlocked) throw new Error('Log in to your Gullak Cloud account before unlocking this cloud family.');
    F.cloudId = F.meta.cloudId;
    const account = G.cloudAccount.user;
    const selected = F.meta.members.find(m => m.id === memberId);
    if (!selected || selected.userId !== account.user_id) {
      if (selected && selected.role === 'supervisor') throw new Error('This supervisor account is not linked to this member.');
      throw new Error('Log in with the Gullak account linked to this family member.');
    }
    const remote = await G.cloud.getFamilyVault(F.cloudId, F.fkRaw);
    if (remote.value && remote.value.meta) {
      F.meta = remote.value.meta;
      F.meta.cloudId = F.cloudId;
      F.data.defaults = (remote.value.data && remote.value.data.defaults) || F.data.defaults || {};
      persistCloudFamilyMeta(F.meta);
    }
    if (F.role === 'supervisor') {
      for (const member of F.meta.members.filter(m => m.role === 'member' && m.userId)) {
        const row = await G.cloud.getMemberVault(F.cloudId, member.userId, F.fkRaw);
        if (row.exists) F.data.kids[member.id] = row.value;
      }
    } else {
      const row = await G.cloud.getMemberVault(F.cloudId, account.user_id, F.fkRaw);
      if (row.exists) {
        F.data.kids[memberId] = row.value;
        G.S = row.value;
      }
    }
    await G.famSave();
  };

  const familyCreateScreen = G.screens['fam-create'];
  if (familyCreateScreen) {
    const renderCreate = familyCreateScreen.render;
    familyCreateScreen.render = (...args) => {
      const html = renderCreate(...args);
      if (G.cloudAccount.unlocked) return html;
      return html.replace('<header', '<section class="card"><h3>☁️ Cloud account required</h3><p class="small muted">Sign in before creating a family so its encrypted data can sync across devices.</p><button class="btn primary block" data-act="cloud-create-login">Log in / create account</button></section><header');
    };
    const handlersCreate = familyCreateScreen.handlers;
    familyCreateScreen.handlers = (...args) => Object.assign(handlersCreate ? handlersCreate(...args) : {}, {
      'cloud-create-login': () => { returnAfterLogin = 'fam-create'; authMode = 'login'; G.go('cloud-account'); }
    });
  }


  G.connectFamilyCloud = async usernames => {
    const F = G.FAM;
    const account = G.cloudAccount.user;
    if (!F || F.role !== 'supervisor') throw new Error('Only a family supervisor can connect this family.');
    if (!G.cloudAccount.unlocked || !account) throw new Error('Log in to a Gullak Cloud account first.');
    if (F.cloudId) throw new Error('This family is already connected to the cloud.');
    const current = F.meta.members.find(m => m.id === F.mid);
    if (!current || current.role !== 'supervisor') throw new Error('The current family member is not a supervisor.');
    current.userId = account.user_id;
    for (const member of F.meta.members) {
      if (member.id === current.id || member.userId) continue;
      const username = String(usernames[member.id] || '').trim();
      if (!/^[a-z0-9_]{3,24}$/i.test(username)) throw new Error('Enter a valid Gullak username for ' + member.name + '.');
    }
    const code = G.cr.recoveryCode();
    const salt = G.cr.salt();
    F.meta.rc = {
      salt,
      wrap: await G.cr.wrapWithSecret(G.cr.normCode(code), salt, F.fkRaw, F.meta.iter)
    };
    const remote = await G.cloud.createFamily({
      name: F.meta.name, joinCode: code, familyKeyRaw: F.fkRaw,
      value: { meta: F.meta, data: { v: 1, defaults: F.data.defaults || {}, createdAt: F.data.createdAt } }
    });
    F.cloudId = remote.family_id;
    F.meta.cloudId = remote.family_id;
    persistCloudFamilyMeta(F.meta);
    for (const member of F.meta.members) {
      if (member.id === current.id || member.userId) continue;
      const linked = await G.cloud.addFamilyMember(F.cloudId, usernames[member.id], member.role);
      member.userId = linked.member.user_id;
    }
    persistCloudFamilyMeta(F.meta);
    await G.famSave();
    return code;
  };

  const supervisorScreen = G.screens.sup;
  if (supervisorScreen) {
    const renderSupervisor = supervisorScreen.render;
    supervisorScreen.render = (...args) => {
      const html = renderSupervisor(...args);
      const F = G.FAM;
      if (!F || F.role !== 'supervisor') return html;
      const status = F.cloudId
        ? '<p class="fine">☁️ This family is connected to encrypted cloud sync.</p>'
        : '<button class="btn soft block" data-act="cloud-connect-family">☁️ Connect this existing family to cloud</button>';
      return html.replace('<button class="btn soft block" data-act="f-code">', status + '<button class="btn soft block" data-act="f-code">');
    };
    const handlersSupervisor = supervisorScreen.handlers;
    supervisorScreen.handlers = (...args) => Object.assign(handlersSupervisor ? handlersSupervisor(...args) : {}, {
      'cloud-connect-family': async () => {
        const F = G.FAM;
        if (!G.cloudAccount.unlocked) {
          returnAfterLogin = 'sup'; authMode = 'login'; G.go('cloud-account'); return;
        }
        const unlinked = F.meta.members.filter(m => m.id !== F.mid && !m.userId);
        const fields = unlinked.map(m => '<label class="label">' + esc(m.name) + ' · ' + (m.role === 'supervisor' ? 'Supervisor' : 'Member') + '</label><input class="input" id="family-link-' + esc(m.id) + '" maxlength="24" placeholder="Their Gullak username">').join('');
        const modal = G.modal({
          html: '<h2>☁️ Connect this family</h2><p class="small muted">Each existing member needs their own Gullak account first. Enter the username for every unlinked member.</p>' +
            (fields || '<p class="small muted">All members are already linked.</p>') +
            '<button class="btn primary block mt" data-act="connect-family-now">Connect and encrypt</button>',
          handlers: {
            'connect-family-now': async button => {
              const usernames = {};
              for (const member of unlinked) usernames[member.id] = G.$('#family-link-' + member.id, modal.el).value.trim();
              button.disabled = true; button.textContent = '🔐 Encrypting family…';
              try {
                const code = await G.connectFamilyCloud(usernames);
                modal.close();
                G.modal({
                  html: '<h2>☁️ Family connected</h2><p>Save this new family recovery/invite code. The previous recovery code has been replaced.</p><div class="code big-code">' + esc(code) + '</div><button class="btn soft block" data-act="copy-new-family-code">📋 Copy code</button><p class="fine">Every member uses their own Gullak username and password, then this code to join the family on a new device.</p>',
                  handlers: { 'copy-new-family-code': () => G.copy(code) }
                });
                G.render({ keepScroll: true });
              } catch (error) {
                button.disabled = false; button.textContent = 'Connect and encrypt';
                G.toast(error.message || 'Could not connect this family.');
              }
            }
          }
        });
      }
    });
  }

  const familyPicker = G.screens['fam-pick'];
  if (familyPicker) {
    const renderPicker = familyPicker.render;
    familyPicker.render = (...args) => renderPicker(...args).replace(
      '<button class="btn primary block big" data-act="go" data-to="fam-create">',
      '<button class="btn soft block" data-act="cloud-families-open">☁️ Find / open a cloud family</button><button class="btn primary block big" data-act="go" data-to="fam-create">'
    );
    const pickerHandlers = familyPicker.handlers;
    familyPicker.handlers = (...args) => Object.assign(pickerHandlers ? pickerHandlers(...args) : {}, {
      'cloud-families-open': () => {
        if (!G.cloudAccount.unlocked) { returnAfterLogin = 'cloud-families'; authMode = 'login'; G.go('cloud-account'); }
        else G.go('cloud-families');
      }
    });
  }

  const routeGuardBeforeCloud = G.routeGuard;
  G.routeGuard = (name, q) => ['cloud-account', 'cloud-families', 'cloud-family-join'].includes(name) ? null :
    (routeGuardBeforeCloud ? routeGuardBeforeCloud(name, q) : null);

  const settings = G.screens.settings;
  if (settings) {
    const renderSettings = settings.render;
    settings.render = (...args) => {
      const html = renderSettings(...args);
      const note = cloudUser
        ? (cloudSecret ? 'Connected and unlocked in this tab.' : 'Account session may be active; enter your passphrase to unlock.')
        : 'Create an account or log in to sync an encrypted copy.';
      const card = `<section class="card"><h3>☁️ Cloud account</h3><p class="small muted">${esc(note)}</p><div class="col gap"><button class="btn soft block" data-act="cloud-open">${cloudUser ? 'Unlock / manage cloud account' : 'Log in / create cloud account'}</button><button class="btn soft block" data-act="cloud-families-open">☁️ Find / manage cloud families</button>${cloudUser ? '<button class="btn ghost block" data-act="cloud-logout">Log out & clear this tab</button>' : ''}</div></section>`;
      return html.replace('<section class="card"><h3>My data</h3>', card + '<section class="card"><h3>My data</h3>');
    };
    const handlersSettings = settings.handlers;
    settings.handlers = (...args) => Object.assign(handlersSettings ? handlersSettings(...args) : {}, {
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); },
      'cloud-families-open': () => {
        if (!G.cloudAccount.unlocked) { returnAfterLogin = 'cloud-families'; authMode = 'login'; G.go('cloud-account'); }
        else G.go('cloud-families');
      },
      'cloud-logout': async () => {
        if (!(await G.confirm('Log out of Gullak Cloud?', 'The decrypted diary will be cleared from this tab. Your existing local copy is retained during migration.', 'Log out', 'Stay'))) return;
        let logoutError = null;
        try { await G.cloudAccount.logout(); } catch (error) { logoutError = error; }
        G.setMode('individual'); G.S = G.fresh(); G.parentUnlocked = false; G.FAM = null;
        if (G.chat) G.chat.length = 0;
        if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
        G.go('welcome');
        if (logoutError) G.toast('This tab was cleared, but server logout could not be confirmed. Close the tab and retry later.');
      }
    });
  }
})(window.G);
