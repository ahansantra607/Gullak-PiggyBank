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
if (!cloudOnlySource.includes('if (G.backupReadOnly) return Promise.resolve();')) throw new Error('Read-only backup mode can still save diary changes.');
if (!cloudOnlySource.includes('owner: { username: G.cloudAccount.user.username }')) throw new Error('Individual backup does not carry its originating account username.');
if (!cloudOnlySource.includes('data-act="backup-read-only"')) throw new Error('Individual backup import has no read-only option.');
if (!cloudOnlySource.includes('G.pendingIndividualBackupUsername')) throw new Error('Individual backup import does not retain the source account username.');
if (!cloudOnlySource.includes("window.prompt('Enter your Gullak account password to replace this account:')")) throw new Error('Replacing a backup destination does not require account-password reauthentication.');
if (!cloudOnlySource.includes('G.cloud.login(G.cloudAccount.user.username, accountPassword)')) throw new Error('Backup replacement does not reauthenticate the destination account.');
if (!cloudOnlySource.includes("G.cloudAccount.setAuthMode('register')")) throw new Error('Backup restore cannot offer account creation.');
if (!cloudOnlySource.includes("member.userId !== G.cloudAccount.user.user_id")) throw new Error('Family PIN unlock is not restricted to the linked Gullak account.');
if (!cloudOnlySource.includes("meta.members.filter(m => G.cloudAccount.user && m.userId === G.cloudAccount.user.user_id)")) throw new Error('Family member picker exposes unlinked member profiles.');
if (!cloudOnlySource.includes("G.go('fam-users', { f: meta.cloudId })")) throw new Error('Family recovery-code flow skips the member PIN picker.');


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
      ? { families: [{ family_id: 'family-1', name: 'Test family', role: 'supervisor' }] }
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
await familyG.cloud.joinFamily('family-1', 'GULL-TEST-CODE');
if (!familyRequests.some(request => request.method === 'POST' && request.url.endsWith('/join'))) {
  throw new Error('Joining a new family did not call the join endpoint.');
}



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
