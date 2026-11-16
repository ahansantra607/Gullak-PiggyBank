import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const files = [
  'js/core.js',
  'js/ui.js',
  'js/screens-main.js',
  'js/screens-ask.js',
  'js/screens-play.js',
  'js/screens-next.js',
  'js/coach.js',
  'js/crypto.js',
  'js/cloud.js',
  'js/family.js',
  'js/cloud-ui.js',
  'js/cloud-only.js',
  'js/app.js'
];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  new vm.Script(source, { filename: file });
}

const cloudOnlySource = readFileSync('js/cloud-only.js', 'utf8');
const appSource = readFileSync('js/app.js', 'utf8');
if (!appSource.includes('(G.FREE_ROUTES || FREE).includes(name)')) throw new Error('Pre-profile routes do not use the live route allowlist; Family screens may redirect to welcome.');
if (!cloudOnlySource.includes("G.FREE_ROUTES.push('family-account')")) throw new Error('Dedicated Family account creator is not allowed before profile setup.');
const cloudUiSource = readFileSync('js/cloud-ui.js', 'utf8');
if (!cloudUiSource.includes('!!G.cloudFamilyReturn')) throw new Error('Cloud login does not preserve an explicit Family-mode return.');
if (!cloudOnlySource.includes("const destination = familyReturn === 'create' ? 'fam-create' : familyReturn === 'open' ? 'cloud-families' : 'fam-pick';")) throw new Error('Family login does not return to the correct next step.');
if (!cloudOnlySource.includes("G.go('fam-users', { f: meta.cloudId })")) throw new Error('Shared Family PIN flow does not show the member picker.');
const familySource = readFileSync('js/family.js', 'utf8');
const cloudSource = readFileSync('js/cloud.js', 'utf8');
const serverSource = readFileSync('server/src/index.ts', 'utf8');
const individualSchemaSource = readFileSync('server/individual-supervision-schema.sql', 'utf8');
const screensAskSource = readFileSync('js/screens-ask.js', 'utf8');

if (!cloudUiSource.includes("data-act=\"individual-role\"") || !cloudUiSource.includes("registerRole === 'kid'") || !cloudUiSource.includes("G.cloud.registerIndividual")) throw new Error('Individual registration does not offer Supervisor and Kid account types.');
if (!cloudUiSource.includes("G.screens['individual-supervision']") || !cloudUiSource.includes("individual-decision") || !cloudUiSource.includes("individual-add-supervisor")) throw new Error('Individual Supervisor dashboard or Kid multiple-Supervisor management is missing.');
if (!cloudUiSource.includes('class="sup-dashboard"') || !cloudUiSource.includes('class="sup-stat-grid"') || !cloudUiSource.includes('class="sup-request-list"') || !cloudUiSource.includes('class="sup-kid-list"')) throw new Error('Individual Supervisor dashboard must use the structured responsive dashboard layout.');
if (!cloudUiSource.includes("if (authMode === 'register' && usernameInput && usernameStatus)")) throw new Error('Username availability ticks must be limited to the registration page, not login.');
if (!cloudUiSource.includes("authMode === 'register' && registerRole === 'kid'") || !cloudUiSource.includes("cloudUser.role === 'supervisor'")) throw new Error('Supervisor account creation still requires a Kid diary or is not independently unlocked.');
if (!cloudOnlySource.includes("G.cloudAccount.user.role === 'supervisor'")) throw new Error('Supervisor accounts are not routed to their dedicated dashboard.');

if (!cloudSource.includes("registerIndividual") || !cloudSource.includes("salt, iterations: ITERATIONS") || cloudSource.includes("salt: C.b64(salt)") || !cloudSource.includes("supervisor_codes")) throw new Error('Kid registration must send the original 16-byte base64 salt without double-encoding it.');
if (!cloudUiSource.includes('id="cloud-password-confirm"') || !cloudUiSource.includes("password !== (G.$('#cloud-password-confirm')?.value || '')") || !cloudUiSource.includes('The account passwords do not match')) throw new Error('Individual account creation must require a matching re-entered account password.');
if (!cloudUiSource.includes('id="cloud-password-status"') || !cloudUiSource.includes("passwordStatus.textContent = hasValue ? (valid ? '✓' : '✕') : ''") || !cloudUiSource.includes('id="cloud-password-rules" class="password-rules" aria-live="polite"') || cloudUiSource.includes('id="cloud-password-rules" class="password-rules" hidden') || cloudUiSource.includes("passwordStatus.addEventListener('click'")) throw new Error('Password field must show a live tick/cross with its checklist always visible and a non-clickable indicator.');
if (!cloudUiSource.includes("usernameStatus.addEventListener('click'") || !cloudUiSource.includes('id="cloud-username-help"') || !cloudUiSource.includes("match.addEventListener('click'") || !cloudUiSource.includes('id="cloud-password-match-help"')) throw new Error('Username and re-enter-password cross indicators must reveal compact explanations when tapped.');
if (!cloudUiSource.includes('id="cloud-password-match"') || !cloudUiSource.includes("matches ? '✓' : '✕'") || !cloudUiSource.includes("matches ? 'var(--green)' : 'var(--red)'") || !cloudUiSource.includes('style="width:100%;box-sizing:border-box;padding-right:44px"')) throw new Error('Both Kid and Supervisor registration must show a live password confirmation tick/cross in a full-width field.');
if (!cloudUiSource.includes('id="cloud-secret-status"') || !cloudUiSource.includes('id="cloud-secret-match-status"') || !cloudUiSource.includes('data-rule="secret-length"') || !cloudUiSource.includes('data-rule="secret-different"') || !cloudUiSource.includes('Encryption passphrase must be at least 10 characters') || !cloudUiSource.includes('Choose an encryption passphrase different from your account password.')) throw new Error('Kid encryption passphrase must have live length/distinctness validation and a matching confirmation tick/cross.');
if (!appSource.includes('G._forceScrollTop = true;') || !appSource.includes('if (G._forceScrollTop) { window.scrollTo(0, 0); G._forceScrollTop = false; }') || !appSource.includes("window.addEventListener('hashchange', () => {\n    G._forceScrollTop = true;")) throw new Error('Navigation, including browser/back-button navigation, must deterministically reset scroll to the top.');

if (!cloudUiSource.includes("G.cloud.createSupervisorCode") || !cloudUiSource.includes("G.cloud.decideSupervisorRequest")) throw new Error('Supervisor code generation or approval actions are not wired to the cloud API.');
if (!cloudOnlySource.includes("name === 'me-pin'") || !cloudOnlySource.includes("name === 'grownup'") || !cloudOnlySource.includes("ls.removeItem('gullak:v1')")) throw new Error('Legacy Individual PIN/Grown-up routes or local diary cleanup remain active.');
if (cloudOnlySource.includes("name === 'ask' && G.cloudAccount") || !cloudOnlySource.includes("data-to=\"individual-supervision\"")) throw new Error('Individual home ask route or Supervisor shortcut is incorrect.');
if (!cloudUiSource.includes("'individual-supervision', 'supervised-kid'")) throw new Error('Supervisor and pending Kid routes are not allowed before profile setup.');
if (!screensAskSource.includes('Ask a Supervisor') || !screensAskSource.includes('your Supervisors') || !screensAskSource.includes('Waiting for ${individualCloud')) throw new Error('Individual requests are not routed to Supervisors.');

if (!serverSource.includes('role !== "supervisor" && role !== "kid"') || !serverSource.includes('role.status !== "active"') || !serverSource.includes('supervisionDecision')) throw new Error('Server does not enforce Individual roles and Supervisor acceptance.');
if (!serverSource.includes('A Supervisor must accept this Kid account before its diary can be opened') || !serverSource.includes('A Supervisor must accept this Kid account before its diary can be edited')) throw new Error('Pending Kid accounts are not blocked from Individual vault access.');
if (!serverSource.includes('individual.role !== "kid"')) throw new Error('Supervisor accounts can access Kid diary vault endpoints.');
if (!cloudSource.includes('shareDiaryKey') || !cloudSource.includes('loadSupervisedKid') || !cloudSource.includes('saveSupervisedKid')) throw new Error('Client encrypted Supervisor diary access methods are missing.');
if (!cloudSource.includes('wrapDiaryKeyForSupervisor') || !cloudSource.includes('unwrapDiaryKeyFromSupervisor')) throw new Error('Supervisor diary keys are not end-to-end encrypted with ECDH.');
if (!serverSource.includes('individual_supervisor_keys') || !serverSource.includes('individual_kid_key_shares')) throw new Error('Encrypted Supervisor key tables are missing from the API.');
if (!cloudSource.includes('registerIndividual(username, password, role, supervisorCodes, secret, supervisorKey, sessionOnly = false)')) throw new Error('Supervisor public/private key bundle is not included during account registration.');
if (!screensAskSource.includes('G.supervisedKidMode') || !screensAskSource.includes('supervisor-return')) throw new Error('Supervisor view does not reuse the existing approvals and chores tools without the old PIN.');
if (!cloudUiSource.includes("G.screens['supervised-kid']") || !cloudUiSource.includes('open-supervised-kid') || !cloudUiSource.includes('makeSupervisorKeyBundle')) throw new Error('Supervisor dashboard cannot open a securely shared Kid diary.');
if (!cloudOnlySource.includes('G.supervisedKidMode && G.supervisedKidId') || !cloudOnlySource.includes('saveSupervisedKid')) throw new Error('Supervisor edits are not synced to the Kid encrypted cloud vault.');
if (!individualSchemaSource.includes('individual_supervisor_keys') || !individualSchemaSource.includes('individual_kid_key_shares')) throw new Error('Supervisor ECDH key-sharing schema is missing.');
if (!serverSource.includes('/api/individual/supervision/key-shares') || !serverSource.includes('/api/individual/supervision/kids/') || !serverSource.includes('status = \'accepted\'')) throw new Error('Server does not enforce accepted relationships for diary-key sharing.');
if (!cloudUiSource.includes('shareKeyWithAcceptedSupervisors') || !cloudUiSource.includes('supervisor_public_key')) throw new Error('Kid login does not share the diary key with accepted Supervisors.');

if (!readFileSync('scripts/smoke-live.mjs', 'utf8').includes('Supervisor accounts cannot open Kid diaries')) throw new Error('Live smoke tests do not verify Supervisor/Kid diary isolation.');

if (!serverSource.includes("status = 'pending' WHERE user_id = ? AND role = 'kid' AND NOT EXISTS") || !serverSource.includes("DELETE FROM sessions WHERE user_id = ? AND NOT EXISTS") || !readFileSync('scripts/smoke-live.mjs', 'utf8').includes("Last Supervisor deletion revokes the Kid's active session")) throw new Error('Deleting a Kid\'s last Supervisor does not re-lock the Kid account and revoke its session.');

if (!cloudUiSource.includes('accountPending') || !cloudUiSource.includes('individual-refresh') || !cloudUiSource.includes('individual-logout')) throw new Error('Pending Kid accounts cannot check approval or log out.');
if (!cloudUiSource.includes('class="kid-pending"') || !cloudUiSource.includes('Create your Gullak') || !cloudUiSource.includes('disabled aria-disabled="true"') || !cloudUiSource.includes("latest.status !== 'active'")) throw new Error('Kid approval window must keep Create your Gullak disabled until a Supervisor accepts.');
if (!cloudUiSource.includes('Supervisor requests') || !cloudUiSource.includes('kid-pending-row') || !cloudUiSource.includes('Accepted') || !cloudUiSource.includes('Pending') || !cloudUiSource.includes('Declined')) throw new Error('Pending Kid page must show the requested Supervisor list and each request status.');
if (cloudUiSource.includes('btn ghost block kid-pending-logout') || cloudUiSource.includes('btn ghost" data-act="individual-logout"')) throw new Error('Log out buttons should use the standard Gullak button style.');
const supervisionScreen = cloudUiSource.slice(cloudUiSource.indexOf("G.screens['individual-supervision']"), cloudUiSource.indexOf("G.screens['supervised-kid']"));
if (!supervisionScreen.includes('Supervisor dashboard') || supervisionScreen.includes('class="back"')) throw new Error('Supervisor dashboard must not show a useless Back button.');
if (supervisionScreen.includes('data-to="settings"') || supervisionScreen.includes('class="back"')) throw new Error('Neither Supervisor dashboard nor the active Kid Manage Supervisors page should show a Back button.');
if (!readFileSync('css/style.css', 'utf8').includes('.kid-pending-hero')) throw new Error('Kid approval screen styling is missing.');

if (!readFileSync('scripts/smoke-live.mjs', 'utf8').includes('Pending Kid can sign in to manage Supervisor requests')) throw new Error('Live smoke tests do not cover the restricted pending Kid state.');

if (!individualSchemaSource.includes('individual_supervisor_links') || !individualSchemaSource.includes("status IN ('active', 'pending')") || !individualSchemaSource.includes('NOT EXISTS (SELECT 1 FROM cloud_family_members')) throw new Error('Individual supervision schema or Family-protected legacy cleanup is missing.');

if (!familySource.includes('Shared Family PIN') || familySource.includes('Your supervisor PIN')) throw new Error('Family creation still asks for a personal supervisor PIN instead of the shared Family PIN.');
if (!cloudOnlySource.includes('G.cloud.createFamily({')) throw new Error('Family creation is not being committed to the cloud.');
if (!cloudOnlySource.includes('familyKey: C.b64(F.fkRaw)')) throw new Error('New Family exports do not include the encrypted-file-wrapped family key.');
if (!cloudSource.includes('passwordOrRole')) throw new Error('Supervisor-created member accounts are not supported by the cloud client.');
if (!serverSource.includes('Family PIN must be 4–6 digits.')) throw new Error('The server does not enforce the shared Family PIN format.');

if (!cloudUiSource.includes('id="cloud-username-status"') || !cloudUiSource.includes("result.available") || !cloudUiSource.includes("result.exists") || !cloudUiSource.includes("Username already used") || !cloudUiSource.includes("Username not found")) throw new Error('Username field must show a live availability/existence tick or cross.');
if (!cloudSource.includes("checkUsername: username => request('/api/username/check'")) throw new Error('Username validation is not checked against the cloud server.');
if (!serverSource.includes('path === "/api/username/check"') || !serverSource.includes('SELECT 1 AS found FROM users WHERE username = ? LIMIT 1')) throw new Error('Cloud username availability endpoint is missing.');

if (!cloudUiSource.includes("authMode === 'register' ? 'placeholder=\"3–24 letters, numbers or _\"' : ''")) throw new Error('Individual username hint should appear only during registration.');
if (!cloudUiSource.includes("authMode === 'register' ? 'placeholder=\"8+ chars: upper, lower, number & symbol\"' : ''")) throw new Error('Individual password hint should appear only during registration.');
if (!cloudSource.includes("registerFamilyAccount") || !cloudSource.includes("loginFamilyAccount")) throw new Error('Family accounts do not use dedicated authentication endpoints.');
if (!cloudOnlySource.includes("G.screens['family-account']") || !cloudOnlySource.includes('Family-only login')) throw new Error('Family mode does not have a dedicated Family account creator/login screen.');
if (cloudOnlySource.includes('>Family username</label>') || !cloudOnlySource.includes('First Supervisor’s personal Gullak username') || !cloudOnlySource.includes('It is not a family username; every member has their own Gullak account.')) throw new Error('First Supervisor username is still presented as a family-level username.');
if (!cloudOnlySource.includes(`familyAuthMode === 'login' ? '<button class="btn ghost block" data-act="family-account-mode">Create a new Family account</button>' : ''`) || cloudOnlySource.includes('I already have a Family account · Log in')) throw new Error('Family creation still offers a login detour on the first Supervisor account screen.');
if (!familySource.includes("G.go('family-account')")) throw new Error('First Supervisor setup does not use the dedicated Family account screen.');
if (!familySource.includes("position: position || name") || !familySource.includes("position: cr.name.trim()")) throw new Error('The first Supervisor does not inherit the family-creation relationship title.');
if (!familySource.includes('id="am-position"') || !familySource.includes("!position) return G.toast('Choose what the kids should call this Supervisor.')") || !familySource.includes("!st.avatarSelected) return G.toast('Choose a picture for this Supervisor.')")) throw new Error('Additional Supervisors do not require a relationship title and an explicitly selected picture.');
if (!familySource.includes("' · ' + esc(m.position)")) throw new Error('Supervisor relationship titles are not displayed beside the Supervisor role.');
if (!familySource.includes('G.cancelPendingFamilyCreation = resetFamilyCreation') || !familySource.includes("cback: () => { resetFamilyCreation(); G.go('fam-pick'); }")) throw new Error('Family wizard Back does not discard all incomplete setup data.');
if (!familySource.includes('G.handleFamilyCreationNavigation') || !appSource.includes('G.handleFamilyCreationNavigation(G._last ||', '')) throw new Error('Browser Back does not reset incomplete Family creation.');
if (!cloudOnlySource.includes("'family-account-back': () =>") || !cloudOnlySource.includes("G.cancelPendingFamilyCreation?.()")) throw new Error('Backing out of Supervisor account creation does not cancel the pending Family setup.');
if (!cloudOnlySource.includes("if (initialRoute === 'fam-create')") || !cloudOnlySource.includes("location.pathname + location.search + '#/fam-pick'")) throw new Error('Refreshing the Family creation wizard does not return to the Family picker.');
if (!serverSource.includes('path === "/api/family/register"') || !serverSource.includes('path === "/api/family/login"')) throw new Error('Server does not separate Family account registration and login.');
if (!serverSource.includes('getCurrentUserAccountType') || !serverSource.includes("Family accounts cannot access Individual diaries.")) throw new Error('Server does not enforce account-type separation and Individual vault isolation.');
if (!serverSource.includes("That username belongs to an Individual account. Create a new Family account for this member.")) throw new Error('Family member creation can still link an Individual account.');
if (!serverSource.includes('Password must be at least 8 characters and include uppercase, lowercase, a number and a special character.')) throw new Error('Supervisor-created accounts do not enforce the account password policy.');

if (!cloudOnlySource.includes('G.cloud.saveFamilyVault(q.f, cached.fkRaw, remote.value)')) throw new Error('Supervisor PIN recovery does not sync updated family metadata.');
if (!cloudOnlySource.includes("'new-cloud-family': () => { mode = 'family'; G.setMode('family'); G.cloudFamilyReturn = false; G.go('fam-create'); }")) throw new Error('Create my family does not open the original creation wizard directly.');
if (!cloudOnlySource.includes("!(mode === 'family' && name === 'fam-create')")) throw new Error('Cloud-only route guard blocks the Family creation wizard before login.');
if (!familySource.includes("G.pendingCloudFamilyCreation = { args, rules: Object.assign({}, cr.rules) }")) throw new Error('Family setup is not retained while the first Supervisor account is created.');
if (!familySource.includes("G.completePendingCloudFamilyCreation = async () =>")) throw new Error('Family setup cannot resume after Supervisor account creation.');
if (!cloudOnlySource.includes("familyReturn === 'create-finalize' && G.pendingCloudFamilyCreation")) throw new Error('Supervisor account creation does not resume and finish Family creation.');
if (cloudUiSource.includes('Cloud account required') || cloudUiSource.includes('cloud-create-login')) throw new Error('Family wizard still has a cloud-login gate before family setup.');
if (cloudUiSource.includes('const createFamilyLocal = G.famCreate')) throw new Error('Family cloud creation is wrapped twice and could create duplicate families.');
if (!cloudOnlySource.includes("const destination = familyReturn === 'create' ? 'fam-create' : familyReturn === 'open' ? 'cloud-families' : 'fam-pick';")) throw new Error('Family account login does not return to the original Family creation wizard.');
if (!cloudOnlySource.includes('G.cloud.listFamilies().then(rows => { G.cloudFamilyResults = rows; })')) throw new Error('Cloud family directory does not load the signed-in user\'s families automatically.');
if (!cloudOnlySource.includes('Choose your profile. Each person signs in with their own Gullak account.')) throw new Error('Family member selection no longer explains individual account sign-in.');
if (!cloudOnlySource.includes('if (G.backupTemporary) return Promise.resolve();')) throw new Error('Temporary backup mode is not isolated from persistence.');
if (!cloudOnlySource.includes('Temporary copy opened. You can edit it, but nothing will be saved anywhere.')) throw new Error('Temporary backup is not described as editable and non-persistent.');
if (!cloudOnlySource.includes('owner: { username: G.cloudAccount.user.username }')) throw new Error('Individual backup does not carry its originating account username.');
if (!cloudOnlySource.includes('data-act="backup-read-only">Open editable temporary copy</button>')) throw new Error('Individual backup import has no editable temporary-copy option.');
if (!cloudOnlySource.includes('G.pendingIndividualBackupUsername')) throw new Error('Individual backup import does not retain the source account username.');
if (!cloudOnlySource.includes("window.prompt('Enter your Gullak account password to replace this account:')")) throw new Error('Replacing a backup destination does not require account-password reauthentication.');
if (!cloudOnlySource.includes('G.cloud.login(G.cloudAccount.user.username, accountPassword)')) throw new Error('Backup replacement does not reauthenticate the destination account.');
if (!cloudOnlySource.includes("G.cloudAccount.setAuthMode('register')")) throw new Error('Backup restore cannot offer account creation.');
if (!cloudOnlySource.includes("member.userId !== G.cloudAccount.user.user_id")) throw new Error('Family member access is not restricted to the linked Gullak account.');
if (!cloudOnlySource.includes("members.map(m =>")) throw new Error('Family member picker does not show the family directory after shared PIN unlock.');
if (!cloudOnlySource.includes("G.go('fam-users', { f: meta.cloudId })")) throw new Error('Shared Family PIN flow does not show the member picker.');


const html = readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(match => match[1]);
for (const script of scripts) {
  if (!existsSync(script)) throw new Error('Missing script referenced by index.html: ' + script);
}
const positions = ['js/crypto.js', 'js/cloud.js', 'js/family.js', 'js/cloud-ui.js', 'js/cloud-only.js', 'js/app.js'].map(file => scripts.indexOf(file));
if (positions.some(index => index < 0) || positions.some((index, i) => i && index <= positions[i - 1])) {
  throw new Error('Cloud scripts are not loaded in the required order.');
}

const context = vm.createContext({
  window: { G: {}, crypto: webcrypto },
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary')
});
vm.runInContext(readFileSync('js/crypto.js', 'utf8'), context);
const C = context.window.G.cr;
const salt = C.salt();
const key = await C.deriveKey('test-backup-passphrase', salt, 100000);
const encrypted = await C.encStr(key, 'Gullak cloud encryption smoke test');
const decrypted = await C.decStr(key, encrypted);
if (decrypted !== 'Gullak cloud encryption smoke test') throw new Error('AES-GCM round-trip failed.');
const wrapped = await C.wrapWithSecret('test-family-code', salt, C.rand(32), 100000);
const unwrapped = await C.unwrapWithSecret('test-family-code', salt, wrapped, 100000);
if (unwrapped.length !== 32) throw new Error('Family-key wrapping round-trip failed.');
const accountWrap = await C.wrapWithSecret('AccountPassword123!', salt, new TextEncoder().encode('SeparateEncryptionPassphrase123!'), 310000);
const accountKey = await C.deriveKey('AccountPassword123!', salt, 310000);
const recoveredSecret = new TextDecoder().decode(await C.dec(accountKey, accountWrap));
if (recoveredSecret !== 'SeparateEncryptionPassphrase123!') throw new Error('Password-only encryption-key recovery failed.');
const supervisorBundle = await C.makeSupervisorKeyBundle('SupervisorPassword123!');
const supervisorPrivate = await C.unlockSupervisorPrivateKey('SupervisorPassword123!', supervisorBundle);
const diaryShare = await C.wrapDiaryKeyForSupervisor('KidDiarySecret123!', supervisorBundle.public_key);
const recoveredDiarySecret = await C.unwrapDiaryKeyFromSupervisor(diaryShare, supervisorPrivate);
if (recoveredDiarySecret !== 'KidDiarySecret123!') throw new Error('Supervisor ECDH diary-key sharing round-trip failed.');

const validAccountPassword = value => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
if (!validAccountPassword('AccountPassword123!') || validAccountPassword('weakpassword') || validAccountPassword('NoSpecial123') || validAccountPassword('Abcdef1 ')) throw new Error('Account password policy validation failed.');

// Existing family members must OPEN directly; only non-members should JOIN.
const familyRequests = [];
const familyG = { cr: {
  normCode: value => String(value).replace(/[^A-Z0-9]/gi, '').toUpperCase(),
  deriveKey: async () => 'wrapping-key',
  dec: async () => 'family-key',
  aesKey: async () => 'family-aes-key',
  decStr: async () => JSON.stringify({ meta: { members: [] }, data: { defaults: {} } }),
  salt: () => 'salt',
  enc: async () => 'iv.ciphertext'
} };
const familyContext = vm.createContext({
  window: { G: familyG },
  fetch: async (url, options = {}) => {
    familyRequests.push({ url: String(url), method: options.method || 'GET' });
    const body = String(url).endsWith('/api/families')
      ? { families: [{ family_id: 'family-1', name: 'Test family', role: 'supervisor', is_member: 1 }] }
      : String(url).endsWith('/join') ? { success: true }
      : { exists: true, vault: { iv: 'iv', ciphertext: 'ciphertext' }, key_wrap_salt: 'salt', key_wrap_iterations: 100000, family_key_wrap: 'wrapped-key' };
    return { ok: true, json: async () => body };
  },
  TextEncoder, TextDecoder, Uint8Array, JSON, encodeURIComponent
});
vm.runInContext(readFileSync('js/cloud.js', 'utf8'), familyContext, { filename: 'js/cloud.js' });
const listedFamilies = await familyG.cloud.listFamilies();
if (!listedFamilies[0]?.is_member) throw new Error('My families list did not mark existing memberships.');
familyRequests.length = 0;
await familyG.cloud.openFamily('family-1', 'GULL-TEST-CODE');
if (familyRequests.some(request => request.method === 'POST' || request.url.endsWith('/join'))) {
  throw new Error('Opening an existing family incorrectly called the join endpoint.');
}
if (familyRequests.length !== 1 || familyRequests[0].method !== 'GET') throw new Error('Opening an existing family should only fetch its vault.');
familyRequests.length = 0;



const localDiary = {
  profile: { nickname: 'Cloud test', createdAt: 1 },
  txns: [], goals: [], requests: [], chores: [], badges: [],
  settings: {}, meta: {}
};
const localMap = new Map([['gullak:v1', JSON.stringify(localDiary)]]);
const storage = {
  getItem: key => localMap.has(key) ? localMap.get(key) : null,
  setItem: (key, value) => localMap.set(key, String(value)),
  removeItem: key => localMap.delete(key)
};
let localWrites = 0;
let remoteSaves = 0;
let remoteVault = null;
const fields = {
  '#cloud-username': { value: 'cloud_smoke_user' },
  '#cloud-password': { value: 'AccountPassword123!' },
  '#cloud-secret': { value: 'SeparateEncryptionPassphrase123!' }
};
const G = {
  esc: value => String(value == null ? '' : value),
  screens: {},
  FREE_ROUTES: [],
  cr: { available: true },
  mode: () => 'individual',
  setMode: () => {},
  fresh: () => ({ profile: null, txns: [], goals: [], requests: [], chores: [], badges: [], settings: {}, meta: {} }),
  normState: value => value,
  save: () => { localWrites++; },
  $: selector => fields[selector],
  confirm: async () => true,
  toast: () => {},
  go: () => {},
  cloud: {
    login: async username => ({ user: { user_id: 'cloud-test-id', username } }),
    loadKeyWrap: async () => 'SeparateEncryptionPassphrase123!',
    saveKeyWrap: async () => ({ success: true }),
    register: async username => ({ user: { user_id: 'cloud-test-id', username } }),
    loadVault: async () => remoteVault,
    saveVault: async value => { remoteSaves++; remoteVault = JSON.parse(JSON.stringify(value)); }
  }
};
const cloudContext = vm.createContext({
  window: { G },
  localStorage: storage,
  console,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  JSON
});
vm.runInContext(readFileSync('js/cloud-ui.js', 'utf8'), cloudContext, { filename: 'js/cloud-ui.js' });
const connect = G.screens['cloud-account'].handlers()['cloud-connect'];
const button = { disabled: false, textContent: '' };
await connect(button);
if (!G.cloudAccount.unlocked) throw new Error('Cloud account did not unlock in the client test.');
if (localMap.has('gullak:v1')) throw new Error('Verified local migration did not clear the plaintext diary.');
if (!remoteVault || remoteVault.profile.nickname !== 'Cloud test') throw new Error('Local diary did not reach the encrypted-cloud save adapter.');
G.S = { ...localDiary, profile: { ...localDiary.profile } };
G.save();
await G.waitForCloudSync();
if (localWrites !== 0) throw new Error('Cloud-unlocked Individual saves still write to local storage.');
if (remoteSaves < 2) throw new Error('Cloud-unlocked Individual saves did not sync remotely.');

const androidCloudSource = readFileSync('js/cloud.js', 'utf8');
const androidWorkerSource = readFileSync('server/src/index.ts', 'utf8');
const androidActivitySource = readFileSync('app/src/main/java/com/ahansantra607/gullak/MainActivity.java', 'utf8');
const androidPinHtml = readFileSync('app/src/main/assets/pin.html', 'utf8');
if (!cloudSource.includes("rememberSessionDevice") || !cloudSource.includes("window.sessionStorage.setItem('gullak-session-only', '1')") || !cloudSource.includes("window.sessionStorage.getItem('gullak-session-only') === '1'")) throw new Error('Unchecked web logins are not retained for the current browser tab session.');
if (!cloudSource.includes("X-Gullak-Session-Only") || !cloudUiSource.includes("G.cloud.login(username, password, !stayLoggedIn && !isAndroidApp)") || !cloudUiSource.includes("rememberSessionDevice(cloudSecret)")) throw new Error('Web login does not distinguish tab-only sessions from persistent sign-in.');
if (!androidCloudSource.includes("sessionOnly && !window.GullakNative")) throw new Error('The browser-only session cookie marker is not excluded from Android.');
if (!androidWorkerSource.includes('const sessionOnly = !isAndroid && request.headers.get("X-Gullak-Session-Only") === "1"') || !androidWorkerSource.includes('const lifetime = sessionOnly ? ""')) throw new Error('The Worker does not issue a browser-session cookie when Stay logged in is unchecked.');
if (!androidCloudSource.includes("'X-Gullak-Android': '1'") || !androidWorkerSource.includes('"Access-Control-Allow-Headers": "Content-Type, X-Gullak-Android, X-Gullak-Session-Only"')) throw new Error('Android requests are not explicitly marked for cross-site session cookies.');
if (!androidWorkerSource.includes('request.headers.get("X-Gullak-Android") === "1" ? "None" : "Strict"')) throw new Error('Android session cookies do not use the cross-site-safe policy while web cookies stay Strict.');
if (!androidActivitySource.includes('CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)') || !androidActivitySource.includes('CookieManager.getInstance().flush()')) throw new Error('Android WebView does not persist its cross-site cloud session cookie.');
if (!androidPinHtml.includes('aria-label="Gullak the piggy bank"') || androidPinHtml.includes('>🐷</div>')) throw new Error('Android PIN page does not use Gullak intro piggy artwork.');
console.log('Frontend syntax, script order, Web Crypto, verified migration and cloud-only Individual saves passed.');
