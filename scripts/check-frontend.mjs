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
  'js/app.js'
];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  new vm.Script(source, { filename: file });
}

const html = readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(match => match[1]);
for (const script of scripts) {
  if (!existsSync(script)) throw new Error('Missing script referenced by index.html: ' + script);
}
const positions = ['js/crypto.js', 'js/cloud.js', 'js/family.js', 'js/cloud-ui.js', 'js/app.js'].map(file => scripts.indexOf(file));
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

console.log('Frontend JavaScript syntax, script order and Web Crypto round-trips passed.');
