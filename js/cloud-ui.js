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
      try { await G.cloud.logout(); } finally {
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
        if (!G.cr || !G.cr.available) return G.toast('Secure browser encryption is unavailable. Open Gullak over HTTPS.');
        button.disabled = true; button.textContent = '🔐 Connecting…';
        try {
          const auth = authMode === 'register'
            ? await G.cloud.register(username, password)
            : await G.cloud.login(username, password);
          cloudUser = auth.user;
          const remote = await G.cloud.loadVault(secret);
          cloudSecret = secret;
          syncError = null;
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
      const card = `<section class="card"><h3>☁️ Cloud account</h3><p class="small muted">${esc(note)}</p><div class="col gap"><button class="btn soft block" data-act="cloud-open">${cloudUser ? 'Unlock / manage cloud account' : 'Log in / create cloud account'}</button>${cloudUser ? '<button class="btn ghost block" data-act="cloud-logout">Log out & clear this tab</button>' : ''}</div></section>`;
      return html.replace('<section class="card"><h3>My data</h3>', card + '<section class="card"><h3>My data</h3>');
    };
    const handlersSettings = settings.handlers;
    settings.handlers = (...args) => Object.assign(handlersSettings ? handlersSettings(...args) : {}, {
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); },
      'cloud-logout': async () => {
        if (!(await G.confirm('Log out of Gullak Cloud?', 'The decrypted diary will be cleared from this tab. Your existing local copy is retained during migration.', 'Log out', 'Stay'))) return;
        let logoutError = null;
        try { await G.cloudAccount.logout(); } catch (error) { logoutError = error; }
        G.S = G.fresh(); G.parentUnlocked = false; G.FAM = null;
        if (G.chat) G.chat.length = 0;
        if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
        G.go('welcome');
        if (logoutError) G.toast('This tab was cleared, but server logout could not be confirmed. Close the tab and retry later.');
      }
    });
  }
})(window.G);
