/* Cloud account UI + encrypted individual-vault sync.
   Local data is deliberately retained during this migration phase. */
(function (G) {
  const esc = G.esc;
  let authMode = 'login';
  let cloudSecret = '';
  let cloudUser = null;
  let syncChain = Promise.resolve();
  let syncError = null;

  G.cloudAccount = {
    get user() { return cloudUser; },
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
  if (!G.FREE_ROUTES.includes('cloud-account')) G.FREE_ROUTES.push('cloud-account');

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
            G.go('home');
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
              G.go('home');
            } else {
              G.toast('Cloud account connected. Your on-device data has not been changed.');
              G.go('home');
            }
          } else {
            G.S = G.fresh();
            G.go('welcome');
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

  // Add a cloud entry point without replacing any existing screen or handler.
  const welcome = G.screens.welcome;
  if (welcome) {
    const renderWelcome = welcome.render;
    welcome.render = (...args) => {
      const html = renderWelcome(...args);
      return html.includes('Start my Gullak') ? html.replace(
        '<button class="btn soft block" data-act="sample">👀 Try it with sample data</button>',
        '<button class="btn soft block" data-act="sample">👀 Try it with sample data</button><button class="btn ghost block" data-act="cloud-open">☁️ Cloud account · Log in / Sign up</button>'
      ) : html;
    };
    const handlersWelcome = welcome.handlers;
    welcome.handlers = (...args) => Object.assign(handlersWelcome ? handlersWelcome(...args) : {}, {
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); },
      'cloud-logout': async () => {
        if (!(await G.confirm('Log out of Gullak Cloud?', 'The decrypted diary will be cleared from this tab. Your saved local copy is not deleted in this migration step.', 'Log out', 'Stay'))) return;
        try { await G.cloudAccount.logout(); } catch (error) { G.toast(error.message || 'Could not log out.'); return; }
        G.S = G.fresh(); G.parentUnlocked = false;
        if (G.chat) G.chat.length = 0;
        if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
        G.go('welcome');
      }
    });
  }

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
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); }
    });
  }
})(window.G);
