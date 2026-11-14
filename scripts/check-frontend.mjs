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
if (!familySource.includes('Shared Family PIN') || familySource.includes('Your supervisor PIN')) throw new Error('Family creation still asks for a personal supervisor PIN instead of the shared Family PIN.');
if (!cloudOnlySource.includes('G.cloud.createFamily({')) throw new Error('Family creation is not being committed to the cloud.');
if (!cloudOnlySource.includes('familyKey: C.b64(F.fkRaw)')) throw new Error('New Family exports do not include the encrypted-file-wrapped family key.');
if (!cloudSource.includes('passwordOrRole')) throw new Error('Supervisor-created member accounts are not supported by the cloud client.');
if (!serverSource.includes('Family PIN must be 4–6 digits.')) throw new Error('The server does not enforce the shared Family PIN format.');
if (!cloudSource.includes("registerFamilyAccount") || !cloudSource.includes("loginFamilyAccount")) throw new Error('Family accounts do not use dedicated authentication endpoints.');
if (!cloudOnlySource.includes("G.screens['family-account']") || !cloudOnlySource.includes('Family-only login')) throw new Error('Family mode does not have a dedicated Family account creator/login screen.');
if (cloudOnlySource.includes('>Family username</label>') || !cloudOnlySource.includes('Supervisor’s Gullak username') || !cloudOnlySource.includes('This username belongs only to the first Supervisor’s account, not to the family.')) throw new Error('First Supervisor username is still presented as a family-level username.');
if (!familySource.includes("G.go('family-account')")) throw new Error('First Supervisor setup does not use the dedicated Family account screen.');
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

console.log('Frontend syntax, script order, Web Crypto, verified migration and cloud-only Individual saves passed.');
