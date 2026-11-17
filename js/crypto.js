/* Gullak on-device encryption (browser Web Crypto, no libraries, nothing sent anywhere).
   • A random 256-bit Family Key encrypts all of a family's data (AES-256-GCM).
   • Each member's PIN, the Family Recovery Code and the security answers each "wrap" (encrypt) the Family Key,
     using PBKDF2-SHA-256 (150,000 rounds) with a random salt.
   • A wrong PIN simply fails to decrypt; no PIN or answer is ever stored. */
(function (G) {
  const C = G.cr = {};
  const enc = new TextEncoder(), dec = new TextDecoder();
  C.ITER = 150000;
  C.available = !!(window.crypto && window.crypto.subtle);

  C.b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  C.unb64 = (s) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
  C.rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  C.salt = () => C.b64(C.rand(16));

  C.aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  C.deriveKey = async (secret, saltB64, iter = C.ITER) => {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: C.unb64(saltB64), iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };
  C.enc = async (key, bytes) => { const iv = C.rand(12); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes); return C.b64(iv) + '.' + C.b64(ct); };
  C.dec = async (key, s) => { const [iv, ct] = String(s).split('.'); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: C.unb64(iv) }, key, C.unb64(ct))); };
  C.encStr = (key, str) => C.enc(key, enc.encode(str));
  C.decStr = async (key, s) => dec.decode(await C.dec(key, s));
  C.wrapWithSecret = async (secret, salt, raw, iter) => C.enc(await C.deriveKey(secret, salt, iter), raw);
  C.unwrapWithSecret = async (secret, salt, wrapped, iter) => C.dec(await C.deriveKey(secret, salt, iter), wrapped);

  // Supervisor keys use ECDH P-256. Private keys are encrypted with the
  // Supervisor's account password; Kid diary keys are shared end-to-end.
  C.makeSupervisorKeyBundle = async password => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicKey = C.b64(await crypto.subtle.exportKey('spki', pair.publicKey));
    const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const salt = C.salt();
    const encrypted = await C.wrapWithSecret(password, salt, privateBytes, C.ITER);
    return { public_key: publicKey, encrypted_private_key: encrypted, salt, iterations: C.ITER };
  };
  C.unlockSupervisorPrivateKey = async (password, bundle) => {
    const bytes = await C.unwrapWithSecret(password, bundle.salt, bundle.encrypted_private_key, bundle.iterations);
    return crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  };

  C.wrapSupervisorPrivateKey = async (password, publicKey, privateKey) => {
    const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
    const salt = C.salt();
    const encrypted = await C.wrapWithSecret(password, salt, privateBytes, 310000);
    return { public_key: publicKey, encrypted_private_key: encrypted, salt, iterations: 310000 };
  };
  C.wrapSupervisorPrivateKeyBytes = async (password, publicKey, privateBytes) => {
    const salt = C.salt();
    const encrypted = await C.wrapWithSecret(password, salt, privateBytes, 310000);
    return { public_key: publicKey, encrypted_private_key: encrypted, salt, iterations: 310000 };
  };
  C.makeIndividualRecoveryCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = C.rand(32);
    let body = '';
    for (let i = 0; i < bytes.length; i++) {
      body += alphabet[bytes[i] & 31];
      if ((i + 1) % 8 === 0 && i !== bytes.length - 1) body += '-';
    }
    return 'GULLAK-' + body;
  };
  C.wrapIndividualRecovery = async (code, payload) => {
    const salt = C.salt();
    const iterations = 310000;
    const key = await C.deriveKey(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''), salt, iterations);
    return { salt, iterations, encrypted_bundle: await C.encStr(key, JSON.stringify(payload)) };
  };
  C.unwrapIndividualRecovery = async (code, envelope) => {
    const key = await C.deriveKey(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''), envelope.salt, envelope.iterations);
    return JSON.parse(await C.decStr(key, envelope.encrypted_bundle));
  };
  const sharedAesKey = async (privateKey, publicKey, salt) => {
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
    const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Gullak Supervisor diary-key share v1') },
      hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };
  C.wrapDiaryKeyForSupervisor = async (diarySecret, supervisorPublicB64) => {
    const supervisorPublic = await crypto.subtle.importKey('spki', C.unb64(supervisorPublicB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const ephemeralPublic = C.b64(await crypto.subtle.exportKey('spki', ephemeral.publicKey));
    const salt = C.rand(16);
    const key = await sharedAesKey(ephemeral.privateKey, supervisorPublic, salt);
    const wrapped = await C.enc(key, enc.encode(String(diarySecret)));
    return { ephemeral_public_key: ephemeralPublic, salt: C.b64(salt), wrapped_diary_key: wrapped };
  };
  C.unwrapDiaryKeyFromSupervisor = async (share, supervisorPrivateKey) => {
    const ephemeralPublic = await crypto.subtle.importKey('spki', C.unb64(share.ephemeral_public_key), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const key = await sharedAesKey(supervisorPrivateKey, ephemeralPublic, C.unb64(share.salt));
    return dec.decode(await C.dec(key, share.wrapped_diary_key));
  };

  /* "Pani Puri " and "panipuri" count as the same answer */
  C.norm = (a) => String(a || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9ऀ-ॿ]/g, '');
  C.recoveryCode = () => {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = C.rand(16); let s = '';
    for (let i = 0; i < 16; i++) { s += A[r[i] % 32]; if (i % 4 === 3 && i < 15) s += '-'; }
    return 'GULL-' + s;
  };
  C.normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GULL/, '');
})(window.G);
