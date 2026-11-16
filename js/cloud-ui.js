/* Cloud account UI + encrypted individual-vault sync.
   Local data is deliberately retained during this migration phase. */
(function (G) {
  const esc = G.esc;
  let authMode = 'login';
  let registerRole = 'supervisor';
  let lastSupervisorCode = '';
  let supervisionData = null;
  let supervisionLoading = false;
  let cloudSecret = '';
  let cloudUser = null;
  let supervisorPrivateKey = null;
  let supervisorOwnState = null;
  let syncChain = Promise.resolve();
  let syncError = null;
  let familyResults = [];
  let selectedFamily = null;
  let returnAfterLogin = null;

  G.cloudAccount = {
    setAuthMode(mode) { authMode = mode === 'register' ? 'register' : 'login'; G.render(); },
    get user() { return cloudUser; },
    get encryptionPassphrase() { return cloudSecret; },
    get unlocked() { return !!cloudUser && (!!cloudSecret || cloudUser.role === 'supervisor'); },
    get status() { return syncError ? 'error' : (cloudSecret || cloudUser?.role === 'supervisor' ? 'connected' : 'locked'); },
    async connectFamily(username, password, create) {
      const auth = create
        ? await G.cloud.registerFamilyAccount(username, password)
        : await G.cloud.loginFamilyAccount(username, password);
      cloudUser = auth.user;
      if (create) {
        cloudSecret = G.cr.b64(G.cr.rand(32));
        await G.cloud.saveKeyWrap(cloudSecret, password);
      } else {
        cloudSecret = await G.cloud.loadKeyWrap(password);
        if (!cloudSecret) {
          cloudSecret = G.cr.b64(G.cr.rand(32));
          await G.cloud.saveKeyWrap(cloudSecret, password);
        }
      }
      syncError = null;
      if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') {
        try { await G.cloud.rememberDevice(cloudSecret); } catch (_) {}
        window.GullakNative.onCloudReady();
      }
      return auth;
    },
    async restoreSession() {
      try {
        const remembered = await G.cloud.restoreRemembered();
        if (!remembered) return false;
        if (remembered.user?.account_type === 'family' && !(window.GullakNative && typeof window.GullakNative.onCloudReady === 'function')) {
          await G.cloud.logout().catch(() => {});
          return false;
        }
        cloudUser = remembered.user; cloudSecret = remembered.secret || ''; syncError = null;
        if (remembered.user?.role === 'kid' && remembered.user?.status === 'pending') {
          if (G.setMode) G.setMode('individual');
          if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
          return true;
        }
        if (remembered.user?.role === 'supervisor') {
          supervisorPrivateKey = null;
          if (G.setMode) G.setMode('individual');
          if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
          return true;
        }
        if (remembered.user?.account_type === 'family') {
          if (G.setMode) G.setMode('family');
          if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
          return true;
        }
        if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
        if (!cloudSecret) return true;
        if (G.setMode) G.setMode('individual');
        const remote = await G.cloud.loadVault(cloudSecret);
        if (remote) G.S = normalize(remote);
        if (remembered.user?.role === 'kid' && remembered.user?.status === 'active') {
          try { await shareKeyWithAcceptedSupervisors(); } catch (error) { console.warn('Supervisor diary-key sharing will retry later:', error); }
        }
        return true;
      } catch (error) {
        cloudSecret = ''; cloudUser = null;
        if (error.status === 401) await G.cloud.clearRememberedDevice().catch(() => {});
        console.warn('Gullak remembered session could not be restored:', error);
        return false;
      }
    },
    async logout() {
      try {
        await syncChain.catch(() => {});
        await familySyncChain.catch(() => {});
        await G.cloud.logout();
      } finally {
        cloudSecret = ''; cloudUser = null; supervisorPrivateKey = null; syncError = null;
        G.supervisedKidMode = false; G.supervisedKidId = null; G.supervisedKidSecret = null; supervisorOwnState = null;
        if (window.GullakNative && typeof window.GullakNative.onCloudLogout === 'function') window.GullakNative.onCloudLogout();
      }
    },
    async deleteAccount(password) {
      await syncChain.catch(() => {});
      await familySyncChain.catch(() => {});
      const result = await G.cloud.deleteAccount(password);
      cloudSecret = ''; cloudUser = null; supervisorPrivateKey = null; syncError = null;
      G.supervisedKidMode = false; G.supervisedKidId = null; G.supervisedKidSecret = null; supervisorOwnState = null;
      if (window.GullakNative && typeof window.GullakNative.onCloudLogout === 'function') window.GullakNative.onCloudLogout();
      return result;
    }
  };

  async function ensureSupervisorPrivateKey() {
    if (supervisorPrivateKey) return true;
    return new Promise(resolve => {
      let modal;
      modal = G.modal({
        html: '<h2>🔐 Unlock Supervisor access</h2><p class="small muted">Enter your Supervisor account password to open a Kid diary. Your password is used only on this device to unlock your encrypted private key.</p><label class="label" for="supervisor-key-password">Account password</label><input class="input" id="supervisor-key-password" type="password" autocomplete="current-password"><button class="btn primary block mt" data-act="unlock-supervisor-key">Unlock securely</button><button class="btn ghost block" data-act="cancel-supervisor-key">Cancel</button>',
        handlers: {
          'unlock-supervisor-key': async button => {
            const password = G.$('#supervisor-key-password', modal.el)?.value || '';
            if (!password) return G.toast('Enter your Supervisor account password.');
            button.disabled = true;
            try {
              let result = await G.cloud.loadSupervisorKey();
              if (!result.exists || !result.key_bundle) {
                await G.cloud.login(cloudUser.username, password);
                const bundle = await G.cr.makeSupervisorKeyBundle(password);
                await G.cloud.saveSupervisorKey(bundle);
                result = { exists: true, key_bundle: bundle };
              }
              supervisorPrivateKey = await G.cr.unlockSupervisorPrivateKey(password, result.key_bundle);
              modal.close();
              resolve(true);
            } catch (error) {
              button.disabled = false;
              G.toast(error.message || 'That password could not unlock your Supervisor key.');
            }
          },
          'cancel-supervisor-key': () => { modal.close(); resolve(false); }
        }
      });
    });
  }

  async function shareKeyWithAcceptedSupervisors() {
    if (cloudUser?.role !== 'kid' || cloudUser?.status !== 'active' || !cloudSecret) return;
    const data = await G.cloud.individualSupervision();
    supervisionData = data;
    for (const link of data.links || []) {
      if (link.status === 'accepted' && link.supervisor_public_key && !link.has_key_share) {
        await G.cloud.shareDiaryKey(link.other_user_id, link.supervisor_public_key, cloudSecret);
        link.has_key_share = 1;
      }
    }
  }

  async function signOutFlow() {
    if (!(await G.confirm('Log out of Gullak Cloud?', 'Your cloud account and saved diary remain intact. This device will be signed out.', 'Log out', 'Stay'))) return;
    let logoutError = null;
    try { await G.cloudAccount.logout(); } catch (error) { logoutError = error; }
    G.setMode('individual'); G.S = G.fresh(); G.parentUnlocked = false; G.FAM = null;
    if (G.chat) G.chat.length = 0;
    if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
    G.go('welcome');
    if (logoutError) G.toast('This tab was cleared, but server logout could not be confirmed. Close the tab and retry later.');
  }

  async function deleteAccountFlow() {
    const supervisorAccount = cloudUser?.role === 'supervisor';
    const deletionMessage = supervisorAccount
      ? 'This permanently deletes your Supervisor account, codes and access. Kids keep their own diaries; any Kid who has no other accepted Supervisor will be locked until another Supervisor accepts.'
      : 'This permanently deletes your Kid account, encrypted diary, password-wrapped encryption key and Supervisor links. This cannot be undone.';
    if (!(await G.confirm('Permanently delete this Gullak account?', deletionMessage, 'Continue to delete', 'Cancel'))) return;
    const modal = G.modal({ html: '<h2>Confirm account deletion</h2><p class="small muted">Enter your Gullak account password to permanently delete this account.</p><input class="input" id="delete-account-password" type="password" autocomplete="current-password" placeholder="Account password"><button class="btn danger block mt" data-act="confirm-delete-account">Permanently delete account</button>', handlers: {
      'confirm-delete-account': async button => {
        const password = G.$('#delete-account-password', modal.el)?.value || '';
        if (!password) return G.toast('Enter your account password to continue.');
        button.disabled = true;
        try {
          await G.cloudAccount.deleteAccount(password);
          modal.close();
          G.setMode('individual'); G.S = G.fresh(); G.parentUnlocked = false; G.FAM = null;
          if (G.chat) G.chat.length = 0;
          if (G.coachCtx) { G.coachCtx.last = null; G.coachCtx.pending = null; }
          localStorage.removeItem('gullak:v1');
          G.go('welcome');
          G.toast('Your Gullak account and its personal data have been permanently deleted.');
        } catch (error) {
          button.disabled = false;
          G.toast(error.message || 'Account deletion failed. Your account has not been deleted.');
        }
      }
    }});
  }

  // Cloud-unlocked Individual mode never writes the money diary to localStorage.
  // Family mode keeps its encrypted local fallback until its cloud-only migration
  // and recovery flow have been verified end to end.
  const saveBeforeCloud = G.save;
  G.save = function () {
    if (G.mode && G.mode() === 'family') {
      saveBeforeCloud();
      return;
    }
    if (!cloudSecret || !cloudUser || !G.S || !G.S.profile) {
      saveBeforeCloud();
      return;
    }
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
  ['cloud-account', 'cloud-families', 'cloud-family-join', 'individual-supervision', 'supervised-kid'].forEach(route => {
    if (!G.FREE_ROUTES.includes(route)) G.FREE_ROUTES.push(route);
  });

  G.screens['cloud-account'] = {
    bare: true,
    render: () => `<section class="ob">
      <header class="page-h"><button class="back" data-act="go" data-to="${G.S.profile ? 'settings' : 'welcome'}" aria-label="Back">←</button><h1>☁️ Gullak Cloud</h1></header>
      <div class="card">
        <h2>${authMode === 'register' ? 'Create your cloud account' : 'Log in to Gullak'}</h2>
        <p class="small muted">${authMode === 'register' ? 'Create a Supervisor account or a Kid account. Kid accounts become active only after a Supervisor accepts.' : 'Your account password signs you in and unlocks your encrypted diary. Your separate encryption passphrase is not requested again.'}</p>
        ${authMode === 'register' ? `<div class="seg"><button class="seg-b ${registerRole === 'supervisor' ? 'on' : ''}" data-act="individual-role" data-v="supervisor">🛡️ Supervisor</button><button class="seg-b ${registerRole === 'kid' ? 'on' : ''}" data-act="individual-role" data-v="kid">🧒 Kid</button></div><p class="hint">${registerRole === 'supervisor' ? 'Create your own account and receive a code that a Kid can use to request you as their Supervisor.' : 'Enter at least one Supervisor code. Each Supervisor must accept before your account can be used.'}</p>` : ''}
        <label class="label" for="cloud-username">Username</label>
        <div style="position:relative;width:100%"><input class="input" style="width:100%;box-sizing:border-box;padding-right:44px" id="cloud-username" maxlength="24" autocomplete="username" ${authMode === 'register' ? 'placeholder="3–24 letters, numbers or _"' : ''}><button type="button" id="cloud-username-status" aria-label="Username status" aria-expanded="false" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;padding:4px;font-size:22px;font-weight:700;cursor:pointer"></button></div><p id="cloud-username-help" class="hint" hidden></p>
        <label class="label" for="cloud-password">Account password</label>
        <div style="position:relative;width:100%"><input class="input" style="width:100%;box-sizing:border-box;padding-right:44px" id="cloud-password" type="password" maxlength="128" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}" ${authMode === 'register' ? 'placeholder="8+ chars: upper, lower, number & symbol"' : ''}><span id="cloud-password-status" aria-live="polite" style="display:none;position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:22px;font-weight:700"></span></div>
        ${authMode === 'register' ? '<div id="cloud-password-rules" class="password-rules" aria-live="polite"><div class="password-rules-title">Password strength checklist</div><div data-rule="length"><span>○</span> At least 8 characters</div><div data-rule="upper"><span>○</span> One uppercase letter</div><div data-rule="lower"><span>○</span> One lowercase letter</div><div data-rule="number"><span>○</span> One number</div><div data-rule="special"><span>○</span> One special character</div></div>' : ''}
        ${authMode === 'register' ? '<label class="label" for="cloud-password-confirm">Re-enter account password</label><div style="position:relative;width:100%"><input class="input" style="width:100%;box-sizing:border-box;' + (registerRole === 'supervisor' ? 'padding-right:44px;' : '') + '" id="cloud-password-confirm" type="password" maxlength="128" autocomplete="new-password" placeholder="Type the account password again">' + (registerRole === 'supervisor' ? '<button type="button" id="cloud-password-match" aria-label="Password confirmation status" aria-expanded="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;padding:4px;font-size:22px;font-weight:700;cursor:pointer"></button>' : '') + '</div><p id="cloud-password-match-help" class="hint" hidden></p>' : ''}
        ${authMode === 'register' && registerRole === 'kid' ? '<label class="label" for="individual-supervisor-codes">Supervisor code(s)</label><input class="input" id="individual-supervisor-codes" maxlength="80" placeholder="Enter one or more codes, separated by commas"><p class="hint">Ask each Supervisor for their 10-character code. You can add more Supervisors later in Settings.</p>' : ''}
        ${authMode === 'register' && registerRole === 'kid' ? '<label class="label" for="cloud-secret">Separate encryption passphrase</label><input class="input" id="cloud-secret" type="password" maxlength="256" autocomplete="new-password" placeholder="Choose a different passphrase"><label class="label" for="cloud-secret-confirm">Confirm encryption passphrase</label><input class="input" id="cloud-secret-confirm" type="password" maxlength="256" autocomplete="new-password" placeholder="Type it again"><p class="hint">This protects the Kid diary. It is encrypted with the account password so login can unlock the diary without asking again.</p>' : ''}
        ${authMode === 'login' && !(window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') ? '<label class="check-row mt"><input id="cloud-stay-logged-in" type="checkbox"> <span>Stay logged in on this device</span></label><p class="hint">Keeps this device signed in while your secure 7-day cloud session is valid. You can still log out from Settings.</p>' : ''}
        <button class="btn primary block big" data-act="cloud-connect">${authMode === 'register' ? (registerRole === 'supervisor' ? 'Create Supervisor account' : 'Create Kid account') : 'Log in to Gullak'}</button>
        <button class="btn ghost block" data-act="cloud-mode">${authMode === 'register' ? 'I already have an account · Log in' : 'New here? · Create an account'}</button>
      </div>
      ${cloudUser ? '<section class="card"><h3>Account actions</h3><button class="btn ghost block" data-act="cloud-signout">Log out</button><button class="btn danger block mt" data-act="cloud-delete-account">Delete account</button></section>' : ''}
      <p class="fine">🔐 Kid diaries sync as encrypted data. Supervisor accounts manage Supervisor codes and requests separately from Kid diaries.</p>
    </section>`,
    handlers: () => ({
      'cloud-mode': () => { authMode = authMode === 'login' ? 'register' : 'login'; registerRole = 'supervisor'; G.render(); },
      'individual-role': el => { registerRole = el.dataset.v === 'kid' ? 'kid' : 'supervisor'; G.render(); },
      'cloud-signout': signOutFlow,
      'cloud-delete-account': deleteAccountFlow,
      'cloud-connect': async (button) => {
        const username = G.$('#cloud-username').value.trim();
        const password = G.$('#cloud-password').value;
        let secret = authMode === 'register' && registerRole === 'kid' ? (G.$('#cloud-secret')?.value || '') : '';
        if (!/^[a-z0-9_]{3,24}$/i.test(username)) return G.toast('Username must be 3–24 letters, numbers or underscores.');
        const passwordOK = password.length >= 8 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
        if (authMode === 'register' && !passwordOK) return G.toast('Use at least 8 characters with uppercase, lowercase, a number and a special character.');
        if (!password || password.length > 128) return G.toast('Enter your account password.');
        if (authMode === 'register' && password !== (G.$('#cloud-password-confirm')?.value || '')) return G.toast('The account passwords do not match. Re-enter your account password.');
        if (authMode === 'register' && registerRole === 'kid' && secret.length < 10) return G.toast('Encryption passphrase must be at least 10 characters.');
        if (authMode === 'register' && registerRole === 'kid' && secret !== G.$('#cloud-secret-confirm')?.value) return G.toast('The encryption passphrases do not match.');
        if (!G.cr || !G.cr.available) return G.toast('Secure browser encryption is unavailable. Open Gullak over HTTPS.');
        const isAndroidApp = !!(window.GullakNative && typeof window.GullakNative.onCloudReady === 'function');
        const stayLoggedIn = (authMode === 'login' && (!!G.$('#cloud-stay-logged-in')?.checked || isAndroidApp)) || (authMode === 'register' && isAndroidApp);
        button.disabled = true; button.textContent = '🔐 Connecting…';
        try {
          const role = registerRole;
          const supervisorCodes = role === 'kid'
            ? (G.$('#individual-supervisor-codes')?.value || '').split(/[ ,;\n]+/).map(v => v.trim()).filter(Boolean)
            : [];
          if (authMode === 'register' && role === 'kid' && !supervisorCodes.length) throw new Error('Enter at least one Supervisor code to create a Kid account.');
          const supervisorKeyBundle = authMode === 'register' && role === 'supervisor'
            ? await G.cr.makeSupervisorKeyBundle(password) : null;
          const auth = authMode === 'register'
            ? await G.cloud.registerIndividual(username, password, role, supervisorCodes, secret, supervisorKeyBundle, !stayLoggedIn && !isAndroidApp)
            : await G.cloud.login(username, password, !stayLoggedIn && !isAndroidApp);
          if (authMode === 'register' && role === 'kid') {
            cloudUser = auth.user; cloudSecret = secret; authMode = 'login'; registerRole = 'supervisor';
            if (G.setMode) G.setMode('individual');
            if (stayLoggedIn) { try { await G.cloud.rememberDevice(cloudSecret); } catch (_) {} }
            else { try { await G.cloud.clearRememberedDevice(); await G.cloud.rememberSessionDevice(cloudSecret); } catch (_) {} }
            if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
            G.go('individual-supervision');
            G.toast('Kid account created. It is locked until at least one Supervisor accepts. You can add more Supervisor codes here while you wait.', 6500);
            return;
          }
          cloudUser = auth.user;
          if (authMode === 'register') {
            lastSupervisorCode = auth.supervisor_code || '';
            authMode = 'login';
            if (G.setMode) G.setMode('individual');
            if (role === 'supervisor') {
              cloudSecret = '';
              supervisorPrivateKey = await G.cr.unlockSupervisorPrivateKey(password, supervisorKeyBundle);
              if (stayLoggedIn) { try { await G.cloud.rememberDevice(''); } catch (_) {} }
              else { try { await G.cloud.clearRememberedDevice(); await G.cloud.rememberSessionDevice(''); } catch (_) {} }
              if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
              G.go('individual-supervision');
              return;
            }
            cloudSecret = secret;
            await G.cloud.saveKeyWrap(cloudSecret, password);
          } else if (auth.user?.role === 'supervisor') {
            cloudSecret = '';
            let keyResult = await G.cloud.loadSupervisorKey();
            if (!keyResult.exists || !keyResult.key_bundle) {
              const bundle = await G.cr.makeSupervisorKeyBundle(password);
              await G.cloud.saveSupervisorKey(bundle);
              keyResult = { exists: true, key_bundle: bundle };
            }
            supervisorPrivateKey = await G.cr.unlockSupervisorPrivateKey(password, keyResult.key_bundle);
          } else {
            cloudSecret = await G.cloud.loadKeyWrap(password);
            if (!cloudSecret) {
              const legacySecret = window.prompt('This older account needs its existing encryption passphrase once to enable password-only logins:');
              if (!legacySecret) throw new Error('The existing encryption passphrase is needed once to upgrade this older account.');
              cloudSecret = legacySecret;
              await G.cloud.loadVault(cloudSecret);
              await G.cloud.saveKeyWrap(cloudSecret, password);
            }
          }
          if (authMode === 'login' && auth.user?.role === 'supervisor') {
            if (stayLoggedIn) { try { await G.cloud.rememberDevice(''); } catch (_) {} }
            else { try { await G.cloud.clearRememberedDevice(); await G.cloud.rememberSessionDevice(''); } catch (_) {} }
            if (G.setMode) G.setMode('individual');
            if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
            G.go('individual-supervision');
            return;
          }
          if (authMode === 'login' && auth.user?.role === 'kid' && auth.user?.status === 'pending') {
            if (stayLoggedIn) { try { await G.cloud.rememberDevice(cloudSecret); } catch (_) {} }
            else { try { await G.cloud.clearRememberedDevice(); await G.cloud.rememberSessionDevice(cloudSecret); } catch (_) {} }
            if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
            if (G.setMode) G.setMode('individual');
            G.go('individual-supervision');
            G.toast('This Kid account is still waiting for a Supervisor to accept.', 6000);
            return;
          }
          if (authMode === 'login' && auth.user?.role === 'kid' && auth.user?.status === 'active') {
            try { await shareKeyWithAcceptedSupervisors(); }
            catch (error) { console.warn('Supervisor diary-key sharing will retry later:', error); }
          }
          syncError = null;
          if (stayLoggedIn) {
            try { await G.cloud.rememberDevice(cloudSecret); }
            catch (rememberError) { G.toast('Signed in, but this browser could not save the stay-logged-in setting.'); }
          } else if (authMode === 'login' && G.cloud.clearRememberedDevice) {
            await G.cloud.clearRememberedDevice().catch(() => {});
            if (!isAndroidApp) {
              try { await G.cloud.rememberSessionDevice(cloudSecret); }
              catch (sessionError) { G.toast('Signed in, but this tab could not retain the session through refresh.'); }
            }
          }
          // Only show the native PIN setup/unlock screen after the account session
          // and encrypted diary key have both been saved for restoration.
          if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') {
            window.GullakNative.onCloudReady();
          }
          const familyReturn = G.mode && G.mode() === 'family' &&
            (!!G.cloudFamilyReturn || ['sup', 'fam-create', 'fam-pick', 'cloud-families', 'cloud-family-join'].includes(returnAfterLogin));
          if (familyReturn) {
            G.go('fam-pick');
            return;
          }
          const remote = await G.cloud.loadVault(cloudSecret);
          if (G.mode) G.setMode('individual');
          if (remote) {
            const local = localIndividual();
            if (local && JSON.stringify(local) !== JSON.stringify(remote)) {
              const replaceCloud = await G.confirm(
                'Two different Gullak copies',
                'An older browser-stored diary was found. Choose Yes to upload it to this cloud account, or No to keep the cloud diary. The older copy is cleared only after the cloud copy is verified.',
                'Replace cloud with this copy', 'Keep cloud copy'
              );
              if (replaceCloud) {
                await G.cloud.saveVault(local, cloudSecret);
                const verifiedLocal = await G.cloud.loadVault(cloudSecret);
                if (!verifiedLocal || JSON.stringify(verifiedLocal) !== JSON.stringify(local)) {
                  throw new Error('Cloud verification failed. Neither copy was cleared.');
                }
                G.S = normalize(verifiedLocal);
              } else {
                G.S = normalize(remote);
              }
            } else {
              G.S = normalize(remote);
            }
            G.save();
            await G.waitForCloudSync();
            localStorage.removeItem('gullak:v1');
            G.toast('☁️ Your encrypted Gullak is unlocked. Browser diary copy cleared.');
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
              const verified = await G.cloud.loadVault(cloudSecret);
              if (!verified || JSON.stringify(verified) !== JSON.stringify(local)) {
                throw new Error('Cloud backup verification failed. Your on-device copy has been kept safe.');
              }
              // Remove the old plaintext diary only after download, decryption and comparison succeed.
              localStorage.removeItem('gullak:v1');
              G.toast('☁️ Your Gullak is encrypted in the cloud. The old local diary copy was cleared.');
              G.go(returnAfterLogin || 'home');
            } else {
              G.toast('Cloud account connected. No diary was uploaded.');
              G.go(returnAfterLogin || 'home');
            }
          } else {
            G.S = G.fresh();
            if (G.mode) G.setMode('individual');
            G.go(returnAfterLogin || 'welcome');
            G.toast('Account ready. Set up your Gullak profile.');
          }
        } catch (error) {
          cloudSecret = ''; cloudUser = null;
          if (G.pendingIndividualBackup && authMode === 'login' && error.status === 401) {
            const create = await G.confirm(
              'Could not sign in',
              'The username may not have an account yet, or the password may be incorrect. If you do not have this account, would you like to create it now?',
              'Create account', 'Try login again'
            );
            if (create) { authMode = 'register'; G.render(); }
          }
          G.toast(error.message || 'Could not connect to Gullak Cloud.');
        } finally {
          button.disabled = false;
          button.textContent = authMode === 'register' ? 'Create account & secure my Gullak' : 'Log in & unlock my Gullak';
        }
      }
    })
  };


  G.screens['individual-supervision'] = {
    bare: true,
    render: () => {
      const role = cloudUser?.role || 'kid';
      const accountPending = cloudUser?.role === 'kid' && (cloudUser?.status === 'pending' || supervisionData?.status === 'pending');
      const links = supervisionData?.links || [];
      const pending = links.filter(x => x.status === 'pending');
      const accepted = links.filter(x => x.status === 'accepted');
      const rejected = links.filter(x => x.status === 'rejected');
      const head = role === 'supervisor'
        ? '<header class="page-h"><h1>🛡️ Supervisor account</h1></header>'
        : '<header class="page-h"><button class="back" data-act="go" data-to="settings">←</button><h1>🛡️ Supervisors</h1></header>';
      if (role === 'supervisor') return `
        <div class="sup-dashboard">
          <header class="sup-dash-head">
            <div class="sup-dash-mark">🛡️</div>
            <div class="sup-dash-heading"><p class="sup-eyebrow">INDIVIDUAL ACCOUNT</p><h1>Supervisor dashboard</h1><p>Manage requests and the Kids you support.</p></div>
            <button class="btn ghost sup-refresh" data-act="individual-refresh" aria-label="Refresh dashboard">↻ <span>Refresh</span></button>
          </header>
          <div class="sup-stat-grid">
            <div class="sup-stat"><span class="sup-stat-icon">⏳</span><strong>${pending.length}</strong><span>Pending requests</span></div>
            <div class="sup-stat"><span class="sup-stat-icon">🧒</span><strong>${accepted.length}</strong><span>Kids supervised</span></div>
          </div>
          <section class="card sup-code-card">
            <div class="sup-section-head"><div><p class="sup-eyebrow">INVITE A KID</p><h2>Your Supervisor code</h2></div><span class="sup-section-icon">🔑</span></div>
            ${lastSupervisorCode ? `<div class="sup-code-reveal"><span>YOUR NEW CODE</span><strong>${esc(lastSupervisorCode)}</strong><p>Share this privately with the Kid you agree to supervise.</p></div>` : '<p class="small muted sup-code-intro">Generate a personal code. A Kid can use it to send you a supervision request.</p>'}
            <button class="btn primary block sup-main-action" data-act="individual-new-code">${lastSupervisorCode ? 'Generate a new code' : '＋ Generate Supervisor code'}</button>
          </section>
          <section class="card sup-section">
            <div class="sup-section-head"><div><p class="sup-eyebrow">NEEDS YOUR ATTENTION</p><h2>Requests <span class="sup-count">${pending.length}</span></h2></div></div>
            ${pending.length ? '<div class="sup-request-list">' + pending.map(x => `<article class="sup-request"><div class="sup-person"><span class="sup-avatar">🧒</span><div><b>${esc(x.other_username)}</b><p>Wants you to become their Supervisor</p></div></div><div class="sup-request-actions"><button class="btn good" data-act="individual-decision" data-id="${esc(x.link_id)}" data-v="accept">Accept</button><button class="btn ghost" data-act="individual-decision" data-id="${esc(x.link_id)}" data-v="reject">Decline</button></div></article>`).join('') + '</div>' : '<div class="sup-empty"><span>📭</span><b>All caught up</b><p>New Kid requests will appear here. You can share your code to invite a Kid.</p></div>'}
          </section>
          <section class="card sup-section">
            <div class="sup-section-head"><div><p class="sup-eyebrow">YOUR CONNECTIONS</p><h2>Kids you supervise <span class="sup-count">${accepted.length}</span></h2></div></div>
            ${accepted.length ? '<div class="sup-kid-list">' + accepted.map(x => `<article class="sup-kid"><span class="sup-avatar">🧒</span><div class="sup-kid-info"><b>${esc(x.other_username)}</b><p>${!x.has_key_share ? 'Waiting for diary access to be shared' : !x.has_diary ? 'Diary not created yet' : 'Diary ready'}</p></div>${!x.has_key_share || !x.has_diary ? '<span class="sup-status-wait">Waiting</span>' : `<button class="btn small primary" data-act="open-supervised-kid" data-id="${esc(x.other_user_id)}" data-name="${esc(x.other_username)}">Open diary →</button>`}</article>`).join('') + '</div>' : '<div class="sup-empty"><span>🌱</span><b>Your list starts here</b><p>Once you accept a Kid’s request, they’ll appear in this section.</p></div>'}
          </section>
          <footer class="sup-account-actions"><button class="btn ghost" data-act="individual-logout">Log out</button><button class="btn danger" data-act="cloud-delete-account">Delete Supervisor account</button></footer>
        </div>`;
      return head + `
        ${accountPending ? '<div class="banner info">⏳ Your Kid account is pending. Your diary stays locked until at least one Supervisor accepts.</div>' : ''}
        <section class="card"><h2>My Supervisors</h2>
          <p class="small muted">A Kid account becomes active only after at least one Supervisor accepts. You can add more Supervisors here at any time.</p>
          <label class="label" for="individual-add-supervisor">Add another Supervisor</label>
          <input class="input" id="individual-add-supervisor" maxlength="20" placeholder="10-character Supervisor code">
          <button class="btn primary block mt" data-act="individual-add-supervisor">Send request</button>
          <h3>Accepted</h3>
          ${accepted.map(x => `<div class="kid-row"><span>🛡️</span><b class="grow">${esc(x.other_username)}</b><span class="small good">Supervisor</span></div>`).join('') || '<p class="small muted">No Supervisor has accepted yet.</p>'}
          <h3>Waiting for acceptance</h3>
          ${pending.map(x => `<div class="kid-row"><span>⏳</span><b class="grow">${esc(x.other_username)}</b><span class="small muted">Pending</span></div>`).join('') || '<p class="small muted">No pending requests.</p>'}
          ${rejected.length ? '<h3>Declined</h3>' + rejected.map(x => `<div class="kid-row"><span>↩️</span><b class="grow">${esc(x.other_username)}</b><span class="small muted">Declined</span></div>`).join('') : ''}
        </section>
        ${accountPending ? '<button class="btn soft block" data-act="individual-refresh">Check approval status</button>' : '<button class="btn soft block" data-act="individual-continue">Continue to my Gullak</button>'}<button class="btn ghost block" data-act="individual-logout">Log out</button>`;
    },
    after: root => {
      if (supervisionLoading || !cloudUser) return;
      supervisionLoading = true;
      G.cloud.individualSupervision().then(async data => {
        supervisionData = data;
        if (cloudUser && data.status) cloudUser.status = data.status;
        if (data.role === 'kid' && data.status === 'active' && cloudSecret) {
          for (const link of data.links || []) {
            if (link.status === 'accepted' && link.supervisor_public_key && !link.has_key_share) {
              try { await G.cloud.shareDiaryKey(link.other_user_id, link.supervisor_public_key, cloudSecret); link.has_key_share = 1; }
              catch (error) { console.warn('Could not share encrypted diary key with a Supervisor:', error); }
            }
          }
        }
        if (location.hash.includes('individual-supervision')) G.render({ keepScroll: true });
      }).catch(error => G.toast(error.message || 'Could not load Supervisor details.'))
        .finally(() => { supervisionLoading = false; });
    },
    handlers: () => ({
      'open-supervised-kid': async el => {
        try {
          if (!(await ensureSupervisorPrivateKey())) return;
          const loaded = await G.cloud.loadSupervisedKid(el.dataset.id, supervisorPrivateKey);
          if (!loaded.state || !loaded.secret) throw new Error('This Kid has not created their diary yet.');
          supervisorOwnState = G.S ? JSON.parse(JSON.stringify(G.S)) : G.fresh();
          G.supervisedKidId = el.dataset.id;
          G.supervisedKidName = el.dataset.name || 'Kid';
          G.supervisedKidSecret = loaded.secret;
          G.supervisedKidMode = true;
          G.S = typeof G.normState === 'function' ? G.normState(loaded.state) : loaded.state;
          G.parentUnlocked = true;
          G.go('supervised-kid');
        } catch (error) { G.toast(error.message || 'Could not open this Kid diary.'); }
      },
      'individual-new-code': async button => {
        button.disabled = true;
        try { const result = await G.cloud.createSupervisorCode(); lastSupervisorCode = result.code; supervisionData = null; G.render({ keepScroll: true }); }
        catch (error) { G.toast(error.message || 'Could not generate a code.'); button.disabled = false; }
      },
      'individual-decision': async el => {
        try { await G.cloud.decideSupervisorRequest(el.dataset.id, el.dataset.v); supervisionData = null; G.toast(el.dataset.v === 'accept' ? 'You are now a Supervisor for this Kid.' : 'Request declined.'); G.render({ keepScroll: true }); }
        catch (error) { G.toast(error.message || 'Could not update the request.'); }
      },
      'individual-add-supervisor': async button => {
        const code = (G.$('#individual-add-supervisor')?.value || '').trim();
        if (!code) return G.toast('Enter a Supervisor code.');
        button.disabled = true;
        try { await G.cloud.requestSupervisor(code); supervisionData = null; G.toast('Request sent. The Supervisor must accept it.'); G.render({ keepScroll: true }); }
        catch (error) { G.toast(error.message || 'Could not send the request.'); button.disabled = false; }
      },
      'individual-refresh': () => { supervisionData = null; G.render({ keepScroll: true }); },
      'individual-logout': signOutFlow,
      'cloud-delete-account': deleteAccountFlow,
      'individual-continue': () => {
        if (window.GullakNative && typeof window.GullakNative.onCloudReady === 'function') window.GullakNative.onCloudReady();
        G.go(G.S?.profile ? 'home' : 'welcome');
      }
    })
  };

  G.supervisedKidMode = false;
  G.restoreSupervisorState = (navigate = true) => {
    if (!G.supervisedKidMode) return;
    G.supervisedKidMode = false;
    G.supervisedKidId = null;
    G.supervisedKidName = null;
    G.supervisedKidSecret = null;
    G.S = supervisorOwnState || G.fresh();
    supervisorOwnState = null;
    G.parentUnlocked = false;
    if (navigate) G.go('individual-supervision');
  };
  G.screens['supervised-kid'] = {
    render: () => G.supervisedKidMode && G.screens.grownup ? G.screens.grownup.render() : '<section class="card">Select a Kid from your Supervisor dashboard.</section>',
    handlers: () => G.supervisedKidMode && G.screens.grownup ? G.screens.grownup.handlers() : ({})
  };

  const settingsRenderBeforeSupervision = G.screens.settings?.render;
  const settingsHandlersBeforeSupervision = G.screens.settings?.handlers;
  if (G.screens.settings && settingsRenderBeforeSupervision) {
    G.screens.settings.render = q => {
      let html = settingsRenderBeforeSupervision(q);
      if (G.mode?.() !== 'family' && cloudUser?.account_type === 'individual') {
        html = html.replace('<section class="card small muted"><h3>About Gullak</h3>', '<section class="card"><h3>🛡️ Supervisors</h3><p class="small muted">Manage Supervisor requests, share your code, or add another Supervisor.</p><button class="btn soft block" data-act="individual-supervision">Manage Supervisors</button></section><section class="card"><h3>Cloud account</h3><button class="btn ghost block" data-act="cloud-signout">Log out</button><button class="btn danger block mt" data-act="cloud-delete-account">Delete account</button></section><section class="card small muted"><h3>About Gullak</h3>');
      }
      return html;
    };
    G.screens.settings.handlers = q => Object.assign(settingsHandlersBeforeSupervision(q), {
      'individual-supervision': () => G.go('individual-supervision'),
      'cloud-signout': signOutFlow,
      'cloud-delete-account': deleteAccountFlow
    });
  }

  G.screens['cloud-account'].after = root => {
    const usernameInput = G.$('#cloud-username', root), usernameStatus = G.$('#cloud-username-status', root);
    if (authMode !== 'register' && usernameStatus) {
      // Login only verifies credentials on submit; do not show availability ticks here.
      usernameStatus.textContent = '';
      usernameStatus.style.display = 'none';
    }
    if (authMode === 'register' && usernameInput && usernameStatus) {
      let checkTimer = null, checkSequence = 0;
      const updateUsername = () => {
        const value = usernameInput.value.trim();
        const sequence = ++checkSequence;
        if (checkTimer) clearTimeout(checkTimer);
        usernameStatus.textContent = '';
        usernameStatus.style.color = '';
        usernameStatus.style.display = value ? 'block' : 'none';
        usernameStatus.setAttribute('aria-expanded', 'false');
        if (!value) return;
        if (!/^[a-z0-9_]{3,24}$/i.test(value)) {
          usernameStatus.textContent = '✕';
          usernameStatus.style.color = 'var(--red)';
          usernameStatus.setAttribute('aria-label', 'Username format is invalid');
          return;
        }
        checkTimer = setTimeout(async () => {
          try {
            const result = await G.cloud.checkUsername(value);
            if (sequence !== checkSequence || usernameInput.value.trim() !== value) return;
            const good = authMode === 'register' ? result.available : result.exists;
            usernameStatus.textContent = good ? '✓' : '✕';
            usernameStatus.style.color = good ? 'var(--green)' : 'var(--red)';
            usernameStatus.setAttribute('aria-label', good
              ? (authMode === 'register' ? 'Username available' : 'Username found')
              : (authMode === 'register' ? 'Username already used' : 'Username not found'));
          } catch (_) {
            if (sequence === checkSequence) {
              usernameStatus.textContent = '';
              usernameStatus.style.color = '';
            }
          }
        }, 350);
      };
      const usernameHelp = G.$('#cloud-username-help', root);
      usernameStatus.addEventListener('click', () => {
        if (usernameStatus.textContent !== '✕' || !usernameHelp) return;
        const reason = usernameStatus.getAttribute('aria-label') || 'This username cannot be used.';
        usernameHelp.textContent = reason === 'Username already used' ? 'That username is already taken. Try another one.' :
          reason === 'Username not found' ? 'No account was found with this username. Check the spelling.' :
          'Use 3–24 letters, numbers or underscores only.';
        usernameHelp.hidden = !usernameHelp.hidden;
        usernameStatus.setAttribute('aria-expanded', String(!usernameHelp.hidden));
      });
      usernameInput.addEventListener('input', () => { if (usernameHelp) usernameHelp.hidden = true; updateUsername(); });
      updateUsername();
    }
    const input = G.$('#cloud-password', root), panel = G.$('#cloud-password-rules', root);
    const passwordStatus = G.$('#cloud-password-status', root);
    const confirmation = G.$('#cloud-password-confirm', root), match = G.$('#cloud-password-match', root);
    if (input && panel && passwordStatus) {
      const rules = { length: v => v.length >= 8, upper: v => /[A-Z]/.test(v), lower: v => /[a-z]/.test(v), number: v => /[0-9]/.test(v), special: v => /[^A-Za-z0-9\\s]/.test(v) };
      const update = () => {
        const checks = Object.entries(rules).map(([key, test]) => {
          const good = test(input.value);
          const row = panel.querySelector('[data-rule="' + key + '"]');
          if (row) { row.classList.toggle('passed', good); row.querySelector('span').textContent = good ? '✓' : '○'; }
          return good;
        });
        const hasValue = input.value.length > 0, valid = checks.every(Boolean);
        passwordStatus.style.display = hasValue ? 'block' : 'none';
        passwordStatus.textContent = hasValue ? (valid ? '✓' : '✕') : '';
        passwordStatus.style.color = hasValue ? (valid ? 'var(--green)' : 'var(--red)') : '';
        passwordStatus.setAttribute('aria-label', valid ? 'Password meets all requirements' : 'Password requirements not yet met');
      };
      input.addEventListener('input', update);
      update();
    }
    if (confirmation && match) {
      const updateMatch = () => {
        const value = confirmation.value;
        const matches = value.length > 0 && value === (input?.value || '');
        match.textContent = value.length ? (matches ? '✓' : '✕') : '';
        match.style.color = value.length ? (matches ? 'var(--green)' : 'var(--red)') : '';
        match.setAttribute('aria-label', value.length ? (matches ? 'Passwords match' : 'Passwords do not match') : '');
      };
      const matchHelp = G.$('#cloud-password-match-help', root);
      match.addEventListener('click', () => {
        if (match.textContent !== '✕' || !matchHelp) return;
        matchHelp.textContent = 'The two account passwords are different. Re-enter the same password in both fields.';
        matchHelp.hidden = !matchHelp.hidden;
        match.setAttribute('aria-expanded', String(!matchHelp.hidden));
      });
      confirmation.addEventListener('input', () => { if (matchHelp) matchHelp.hidden = true; updateMatch(); });
      input?.addEventListener('input', () => { if (matchHelp) matchHelp.hidden = true; updateMatch(); });
      updateMatch();
    }
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
      if (window.GullakNative && typeof window.GullakNative.saveEncryptedBackup === 'function') {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          window.GullakNative.saveEncryptedBackup('gullak-encrypted-backup.gullak', 'application/json', dataUrl.slice(dataUrl.indexOf(',') + 1));
        };
        reader.readAsDataURL(new Blob([text], { type: 'application/json' }));
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'gullak-encrypted-backup.gullak'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };

  G.screens['cloud-families'] = {
    bare: true,
    render: () => {
      if (!G.cloudAccount.unlocked) return '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="fam-pick">←</button><h1>☁️ Cloud families</h1></header><section class="card"><p>Sign in with your Family-only account first.</p><button class="btn primary block" data-act="cloud-login">Log in to Family</button></section></section>';
      const rows = familyResults.map(f => '<div class="kid-row"><div class="grow"><b>' + esc(f.name) + '</b><small>' + (f.is_member ? 'Already a member' : 'Shared Family PIN required') + '</small></div><button class="btn small soft" data-act="family-select" data-id="' + esc(f.family_id) + '" data-name="' + esc(f.name) + '">Open</button></div>').join('');
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
    render: () => '<section class="ob"><header class="page-h"><button class="back" data-act="go" data-to="cloud-families">←</button><h1>🔐 Join family</h1></header><section class="card"><h2>' + esc(selectedFamily ? selectedFamily.name : 'Family') + '</h2><p class="small muted">Enter the family recovery/invite code. It unlocks the family encryption key for this session.</p><label class="label" for="cloud-family-code">Family code</label><input class="input" id="cloud-family-code" maxlength="40" autocomplete="off" placeholder="GULL-XXXX-XXXX-XXXX-XXXX"><button class="btn primary block big" data-act="family-join">Join and unlock</button></section></section>',
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

  G.connectFamilyCloud = async usernames => {
    const F = G.FAM;
    const account = G.cloudAccount.user;
    if (!F || F.role !== 'supervisor') throw new Error('Only a family supervisor can connect this family.');
    if (!G.cloudAccount.unlocked || !account) throw new Error('Log in to a Gullak Cloud account first.');
    const current = F.meta.members.find(m => m.id === F.mid);
    if (!current || current.role !== 'supervisor') throw new Error('The current family member is not a supervisor.');
    if (current.userId && current.userId !== account.user_id) throw new Error('This supervisor is linked to a different Gullak account.');
    current.userId = account.user_id;
    for (const member of F.meta.members) {
      if (member.id === current.id || member.userId) continue;
      const username = String(usernames[member.id] || '').trim();
      if (!/^[a-z0-9_]{3,24}$/i.test(username)) throw new Error('Enter a valid Gullak username for ' + member.name + '.');
    }
    let code = null;
    if (!F.cloudId) {
      code = G.cr.recoveryCode();
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
    }
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
      const unlinkedCount = F.meta.members.filter(m => !m.userId).length;
      const status = F.cloudId
        ? '<p class="fine">☁️ This family is connected to encrypted cloud sync.</p>' +
          (unlinkedCount ? '<button class="btn soft block" data-act="cloud-connect-family">Link remaining member accounts (' + unlinkedCount + ')</button>' : '')
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
                if (code) {
                  G.modal({
                    html: '<h2>☁️ Family connected</h2><p>Save this new family recovery/invite code. The previous recovery code has been replaced.</p><div class="code big-code">' + esc(code) + '</div><button class="btn soft block" data-act="copy-new-family-code">📋 Copy code</button><p class="fine">Every member uses their own Gullak username and password, then this code to join the family on a new device.</p>',
                    handlers: { 'copy-new-family-code': () => G.copy(code) }
                  });
                } else {
                  G.toast('Remaining member accounts linked and synced.');
                }
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
        // Browsing the public family directory must not require an account login.
        G.setMode('family');
        G.go('cloud-families');
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
        ? (cloudSecret ? 'Connected and unlocked in this tab.' : 'Account session may be active; log in with your account password to unlock.')
        : 'Create an account or log in to sync an encrypted copy.';
      const card = `<section class="card"><h3>☁️ Cloud account</h3><p class="small muted">${esc(note)}</p><div class="col gap">${cloudUser ? '<button class="btn soft block" data-act="cloud-logout">Log out</button><button class="btn danger block" data-act="cloud-delete-account">Delete account</button>' : '<button class="btn soft block" data-act="cloud-open">Log in / create cloud account</button>'}</div></section>`;
      const aboutAnchor = '<section class="card small muted"><h3>About Gullak</h3>';
      return html.includes(aboutAnchor) ? html.replace(aboutAnchor, card + aboutAnchor) : html + card;
    };
    const handlersSettings = settings.handlers;
    settings.handlers = (...args) => Object.assign(handlersSettings ? handlersSettings(...args) : {}, {
      'cloud-open': () => { authMode = 'login'; G.go('cloud-account'); },
      'cloud-families-open': () => {
        if (!G.cloudAccount.unlocked) { returnAfterLogin = 'cloud-families'; authMode = 'login'; G.go('cloud-account'); }
        else G.go('cloud-families');
      },
      'cloud-logout': signOutFlow,
      'cloud-delete-account': deleteAccountFlow
    });
  }
})(window.G);
