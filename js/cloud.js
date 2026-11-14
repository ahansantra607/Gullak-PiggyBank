/* Gullak cloud transport.
   Account sessions are HttpOnly cookies. Vault plaintext and passphrases stay in
   the browser; only AES-GCM ciphertext, IV and a random salt reach the Worker. */
(function (G) {
  const C = G.cr;
  const API = 'https://server.ahansantra607.workers.dev';
  const encoder = new TextEncoder();
  const ITERATIONS = 310000;
  let saveChain = Promise.resolve();

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(data.error || 'Cloud request failed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const rememberDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('gullak-device-session', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('session');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Device session storage unavailable.'));
  });
  async function rememberDevice(secret) {
    const db = await rememberDb();
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(secret));
      await new Promise((resolve, reject) => {
        const tx = db.transaction('session', 'readwrite');
        tx.objectStore('session').put({ key, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) }, 'remembered');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function readRememberedDevice() {
    const db = await rememberDb();
    try {
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction('session', 'readonly');
        const req = tx.objectStore('session').get('remembered');
        req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
      });
      if (!record || !record.key || !record.iv || !record.ciphertext) return null;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, record.key, new Uint8Array(record.ciphertext));
      return new TextDecoder().decode(plain);
    } finally { db.close(); }
  }
  async function clearRememberedDevice() {
    if (!('indexedDB' in window)) return;
    const db = await rememberDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('session', 'readwrite'); tx.objectStore('session').delete('remembered');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  G.cloud = {
    endpoint: API,
    register: (username, password) => request('/api/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
    login: (username, password) => request('/api/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
    me: () => request('/api/me'),
    rememberDevice,
    readRememberedDevice,
    clearRememberedDevice,
    async restoreRemembered() {
      const user = await request('/api/me');
      const secret = await readRememberedDevice();
      return { user: user.user || user, secret: secret || '' };
    },
    async logout() {
      try { await request('/api/logout', { method: 'POST' }); }
      finally { await clearRememberedDevice().catch(() => {}); }
    },
    async deleteAccount(password) {
      const result = await request('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      await clearRememberedDevice().catch(() => {});
      return result;
    },
    async saveKeyWrap(secret, accountPassword) {
      const salt = C.salt();
      const wrapped = await C.wrapWithSecret(accountPassword, salt, encoder.encode(secret), ITERATIONS);
      return request('/api/key-wrap', { method: 'PUT', body: JSON.stringify({ wrapped_secret: wrapped, salt, iterations: ITERATIONS }) });
    },
    async loadKeyWrap(accountPassword) {
      const result = await request('/api/key-wrap');
      if (!result.exists || !result.key_wrap) return null;
      const row = result.key_wrap, key = await C.deriveKey(accountPassword, row.salt, row.iterations);
      return new TextDecoder().decode(await C.dec(key, row.wrapped_secret));
    },
    async loadVault(passphrase) {
      if (!C || !C.available) throw new Error('Secure browser encryption is unavailable.');
      const result = await request('/api/vault');
      if (!result.exists || !result.vault) return null;
      const vault = result.vault;
      const key = await C.deriveKey(passphrase, vault.salt, ITERATIONS);
      const packed = vault.iv + '.' + vault.ciphertext;
      const plain = await C.decStr(key, packed);
      return JSON.parse(plain);
    },
    saveVault(value, passphrase) {
      if (!C || !C.available) return Promise.reject(new Error('Secure browser encryption is unavailable.'));
      const snapshot = JSON.stringify(value);
      const task = saveChain.catch(() => {}).then(async () => {
        const salt = C.salt();
        const key = await C.deriveKey(passphrase, salt, ITERATIONS);
        const packed = await C.enc(key, encoder.encode(snapshot));
        const split = packed.indexOf('.');
        const iv = packed.slice(0, split);
        const ciphertext = packed.slice(split + 1);
        await request('/api/vault', {
          method: 'PUT',
          body: JSON.stringify({
            ciphertext,
            iv,
            salt,
            schema_version: 1
          })
        });
      });
      saveChain = task;
      return task;
    },
    async health() {
      return request('/api/health');
    }
  };

  const familyVaultPayload = async (value, familyKeyRaw) => {
    const key = await C.aesKey(familyKeyRaw);
    const packed = await C.enc(key, encoder.encode(JSON.stringify(value)));
    const split = packed.indexOf('.');
    return { ciphertext: packed.slice(split + 1), iv: packed.slice(0, split), salt: C.salt(), schema_version: 1 };
  };
  const decryptFamilyVault = async (vault, familyKeyRaw) => {
    if (!vault) return null;
    const key = await C.aesKey(familyKeyRaw);
    const plain = await C.decStr(key, vault.iv + '.' + vault.ciphertext);
    return JSON.parse(plain);
  };
  const familyPath = id => '/api/families/' + encodeURIComponent(id);

  Object.assign(G.cloud, {
    async listFamilies() {
      return ((await request('/api/families')).families || []).map(f => ({ ...f, is_member: true }));
    },
    async searchFamilies(query) {
      return (await request('/api/families/search?q=' + encodeURIComponent(query))).families || [];
    },
    async openFamily(familyId, recoveryCode) {
      const result = await request(familyPath(familyId) + '/vault');
      if (!result.exists || !result.vault) throw new Error('This family has no saved cloud vault yet.');
      const wrappingKey = await C.deriveKey(C.normCode(recoveryCode), result.key_wrap_salt, result.key_wrap_iterations);
      const familyKeyRaw = await C.dec(wrappingKey, result.family_key_wrap);
      const value = await decryptFamilyVault(result.vault, familyKeyRaw);
      return { family: { family_id: familyId }, familyKeyRaw, value };
    },
    async createFamily({ name, joinCode, familyKeyRaw, value }) {
      const salt = C.salt();
      const wrappingKey = await C.deriveKey(C.normCode(joinCode), salt, ITERATIONS);
      const familyKeyWrap = await C.enc(wrappingKey, familyKeyRaw);
      const vault = await familyVaultPayload(value, familyKeyRaw);
      const result = await request('/api/families', {
        method: 'POST',
        body: JSON.stringify({
          name, join_code: C.normCode(joinCode), family_key_wrap: familyKeyWrap,
          key_wrap_salt: salt, key_wrap_iterations: ITERATIONS, vault
        })
      });
      return result.family;
    },
    async joinFamily(familyId, joinCode) {
      await request(familyPath(familyId) + '/join', {
        method: 'POST', body: JSON.stringify({ join_code: C.normCode(joinCode) })
      });
      const result = await request(familyPath(familyId) + '/vault');
      const wrappingKey = await C.deriveKey(C.normCode(joinCode), result.key_wrap_salt, result.key_wrap_iterations);
      const familyKeyRaw = await C.dec(wrappingKey, result.family_key_wrap);
      const value = await decryptFamilyVault(result.vault, familyKeyRaw);
      return { family: { family_id: familyId }, familyKeyRaw, value };
    },
    async getFamilyVault(familyId, familyKeyRaw) {
      const result = await request(familyPath(familyId) + '/vault');
      return { family: result, value: await decryptFamilyVault(result.vault, familyKeyRaw) };
    },
    async saveFamilyVault(familyId, familyKeyRaw, value) {
      return request(familyPath(familyId) + '/vault', {
        method: 'PUT', body: JSON.stringify(await familyVaultPayload(value, familyKeyRaw))
      });
    },
    async listFamilyMembers(familyId) {
      return (await request(familyPath(familyId) + '/members')).members || [];
    },
    addFamilyMember: (familyId, username, role = 'member') => request(familyPath(familyId) + '/members', {
      method: 'POST', body: JSON.stringify({ username, role })
    }),
    removeFamilyMember: (familyId, userId) => request(familyPath(familyId) + '/members', {
      method: 'DELETE', body: JSON.stringify({ user_id: userId })
    }),
    renameFamily: (familyId, name) => request(familyPath(familyId), {
      method: 'PUT', body: JSON.stringify({ name })
    }),
    deleteFamily: familyId => request(familyPath(familyId), { method: 'DELETE' }),
    async updateFamilyCode(familyId, familyKeyRaw, joinCode) {
      const salt = C.salt();
      const wrappingKey = await C.deriveKey(C.normCode(joinCode), salt, ITERATIONS);
      const familyKeyWrap = await C.enc(wrappingKey, familyKeyRaw);
      return request(familyPath(familyId) + '/code', {
        method: 'PUT',
        body: JSON.stringify({
          join_code: C.normCode(joinCode), family_key_wrap: familyKeyWrap,
          key_wrap_salt: salt, key_wrap_iterations: ITERATIONS
        })
      });
    },
    async getMemberVault(familyId, userId, familyKeyRaw) {
      const query = userId ? '?user_id=' + encodeURIComponent(userId) : '';
      const result = await request(familyPath(familyId) + '/member-vault' + query);
      return { exists: result.exists, value: await decryptFamilyVault(result.vault, familyKeyRaw) };
    },
    async saveMemberVault(familyId, userId, familyKeyRaw, value) {
      return request(familyPath(familyId) + '/member-vault', {
        method: 'PUT', body: JSON.stringify({ ...(await familyVaultPayload(value, familyKeyRaw)), ...(userId ? { user_id: userId } : {}) })
      });
    }
  });

})(window.G);
