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

  G.cloud = {
    endpoint: API,
    register: (username, password) => request('/api/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
    login: (username, password) => request('/api/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    }),
    me: () => request('/api/me'),
    logout: () => request('/api/logout', { method: 'POST' }),
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
})(window.G);
