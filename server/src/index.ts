
const ITERATIONS = 310_000;
const SESSION_DAYS = 7;
const encoder = new TextEncoder();
const MAX_VAULT_BYTES = 900_000;

const APP_ORIGIN = "https://gullak-piggybank.ahansantra607.workers.dev";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

type UserRow = {
  user_id: string;
  username: string;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
};

type VaultRow = {
  ciphertext: string;
  iv: string;
  salt: string;
  schema_version: number;
  updated_at: string;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...CORS_HEADERS }
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function validBase64(value: string): boolean {
  try {
    return value.length > 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
      toBase64(fromBase64(value)) === value;
  } catch {
    return false;
  }
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );
  return toBase64(new Uint8Array(digest));
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    key,
    256
  );

  return toBase64(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;

  for (let i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return difference === 0;
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const entry = cookie.split(";").map(v => v.trim())
    .find(v => v.startsWith(`${name}=`));

  return entry ? entry.slice(name.length + 1) : null;
}

function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `gullak_session=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `gullak_session=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === APP_ORIGIN || new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function getCurrentUser(
  request: Request,
  env: Env
): Promise<{ user_id: string; username: string } | null> {
  const token = getCookie(request, "gullak_session");
  if (!token || token.length > 200) return null;

  const tokenHash = await sha256(token);

  const session = await env.gullak_db
    .prepare(`
      SELECT users.user_id, users.username
      FROM sessions
      JOIN users ON users.user_id = sessions.user_id
      WHERE sessions.session_id_hash = ?
        AND sessions.expires_at > ?
    `)
    .bind(tokenHash, new Date().toISOString())
    .first<{ user_id: string; username: string }>();

  return session || null;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (origin !== APP_ORIGIN) return json({ error: "Invalid request origin" }, 403);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (path === "/" && request.method === "GET") {
      return json({
        app: "Gullak Server",
        status: "running"
      });
    }

    if (path === "/api/health" && request.method === "GET") {
      try {
        const table = await env.gullak_db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = ? AND name = ?"
          )
          .bind("table", "user_vaults")
          .first();

        if (!table) {
          return json({
            status: "error",
            message: "Vault table not found"
          }, 500);
        }

        return json({
          status: "healthy",
          database: "connected",
          vaultTable: "ready"
        });
      } catch {
        return json({
          status: "error",
          message: "Database connection failed"
        }, 500);
      }
    }

    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      !validOrigin(request)
    ) {
      return json({ error: "Invalid request origin" }, 403);
    }

    // REGISTER
    if (path === "/api/register" && request.method === "POST") {
      try {
        const body = await request.json() as {
          username?: string;
          password?: string;
        };

        const username = body.username?.trim().toLowerCase() || "";
        const password = body.password || "";

        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
          return json({
            error: "Username must be 3–24 characters using letters, numbers or underscores."
          }, 400);
        }

        if (password.length < 10 || password.length > 128) {
          return json({
            error: "Password must be between 10 and 128 characters."
          }, 400);
        }

        const salt = randomBytes(16);
        const passwordHash = await derivePasswordHash(
          password, salt, ITERATIONS
        );

        const userId = crypto.randomUUID();
        const now = new Date();
        const expires = new Date(
          now.getTime() + SESSION_DAYS * 86400000
        );

        const token = toBase64(randomBytes(32));
        const tokenHash = await sha256(token);

        // D1 batch makes account + first session creation atomic.
        await env.gullak_db.batch([
          env.gullak_db.prepare(`
            INSERT INTO users (
              user_id, username, password_salt,
              password_hash, password_iterations, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            userId, username, toBase64(salt),
            passwordHash, ITERATIONS, now.toISOString()
          ),
          env.gullak_db.prepare(`
            INSERT INTO sessions (
              session_id_hash, user_id, created_at, expires_at
            ) VALUES (?, ?, ?, ?)
          `).bind(
            tokenHash, userId,
            now.toISOString(), expires.toISOString()
          )
        ]);

        return new Response(JSON.stringify({
          success: true,
          user: { user_id: userId, username }
        }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": sessionCookie(token, request),
            ...CORS_HEADERS
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message.includes("UNIQUE")) {
          return json({ error: "That username is already taken." }, 409);
        }

        return json({ error: "Could not create account." }, 400);
      }
    }

    // LOGIN
    if (path === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json() as {
          username?: string;
          password?: string;
        };

        const username = body.username?.trim().toLowerCase() || "";
        const password = body.password || "";

        if (
          !/^[a-z0-9_]{3,24}$/.test(username) ||
          password.length < 1 ||
          password.length > 128
        ) {
          return json({ error: "Invalid username or password." }, 400);
        }

        const user = await env.gullak_db.prepare(`
          SELECT user_id, username, password_salt,
                 password_hash, password_iterations
          FROM users WHERE username = ?
        `).bind(username).first<UserRow>();

        // Perform a PBKDF2 operation even for unknown usernames to reduce
        // username-enumeration timing differences.
        const calculatedHash = await derivePasswordHash(
          password,
          user ? fromBase64(user.password_salt) : new Uint8Array(16),
          user ? user.password_iterations : ITERATIONS
        );

        if (!user) {
          return json({ error: "Invalid username or password." }, 401);
        }

        if (!constantTimeEqual(calculatedHash, user.password_hash)) {
          return json({ error: "Invalid username or password." }, 401);
        }

        const now = new Date();
        const expires = new Date(
          now.getTime() + SESSION_DAYS * 86400000
        );

        const token = toBase64(randomBytes(32));
        const tokenHash = await sha256(token);

        await env.gullak_db.prepare(`
          INSERT INTO sessions (
            session_id_hash, user_id, created_at, expires_at
          ) VALUES (?, ?, ?, ?)
        `).bind(
          tokenHash, user.user_id,
          now.toISOString(), expires.toISOString()
        ).run();

        return new Response(JSON.stringify({
          success: true,
          user: {
            user_id: user.user_id,
            username: user.username
          }
        }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": sessionCookie(token, request)
          }
        });
      } catch {
        return json({ error: "Could not log in." }, 400);
      }
    }

    // CHECK SESSION
    if (path === "/api/me" && request.method === "GET") {
      try {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({ authenticated: false }, 401);
        }

        return json({ authenticated: true, user });
      } catch {
        return json({ error: "Could not check session." }, 500);
      }
    }

    // LOGOUT
    if (path === "/api/logout" && request.method === "POST") {
      try {
        const token = getCookie(request, "gullak_session");

        if (token) {
          const tokenHash = await sha256(token);

          await env.gullak_db.prepare(
            "DELETE FROM sessions WHERE session_id_hash = ?"
          ).bind(tokenHash).run();
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": clearSessionCookie(request),
            ...CORS_HEADERS
          }
        });
      } catch {
        return json({ error: "Could not log out." }, 500);
      }
    }

    // GET ENCRYPTED VAULT
    if (path === "/api/vault" && request.method === "GET") {
      try {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({ error: "Authentication required." }, 401);
        }

        const vault = await env.gullak_db.prepare(`
          SELECT ciphertext, iv, salt, schema_version, updated_at
          FROM user_vaults
          WHERE user_id = ?
        `).bind(user.user_id).first<VaultRow>();

        if (!vault) {
          return json({
            exists: false,
            vault: null
          });
        }

        return json({
          exists: true,
          vault
        });
      } catch {
        return json({ error: "Could not retrieve vault." }, 500);
      }
    }

    // SAVE OR UPDATE ENCRYPTED VAULT
    if (path === "/api/vault" && request.method === "PUT") {
      try {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({ error: "Authentication required." }, 401);
        }

        const contentLength = Number(
          request.headers.get("Content-Length") || 0
        );

        if (contentLength > MAX_VAULT_BYTES + 10_000) {
          return json({ error: "Vault is too large." }, 413);
        }

        const rawBody = await request.text();

        if (encoder.encode(rawBody).length > MAX_VAULT_BYTES + 10_000) {
          return json({ error: "Vault is too large." }, 413);
        }

        const body = JSON.parse(rawBody) as {
          ciphertext?: string;
          iv?: string;
          salt?: string;
          schema_version?: number;
        };

        const ciphertext = body.ciphertext || "";
        const iv = body.iv || "";
        const salt = body.salt || "";
        const schemaVersion = body.schema_version;

        if (
          !Number.isInteger(schemaVersion) ||
          !schemaVersion ||
          schemaVersion < 1 ||
          schemaVersion > 100
        ) {
          return json({ error: "Invalid schema version." }, 400);
        }

        if (
          !validBase64(ciphertext) ||
          !validBase64(iv) ||
          !validBase64(salt)
        ) {
          return json({ error: "Invalid encrypted data encoding." }, 400);
        }

        const ciphertextBytes = fromBase64(ciphertext);
        const ivBytes = fromBase64(iv);
        const saltBytes = fromBase64(salt);

        if (
          ciphertextBytes.length < 16 ||
          ciphertextBytes.length > MAX_VAULT_BYTES ||
          ivBytes.length !== 12 ||
          saltBytes.length !== 16
        ) {
          return json({ error: "Invalid encrypted data size." }, 400);
        }

        const updatedAt = new Date().toISOString();

        await env.gullak_db.prepare(`
          INSERT INTO user_vaults (
            user_id, ciphertext, iv, salt,
            schema_version, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            ciphertext = excluded.ciphertext,
            iv = excluded.iv,
            salt = excluded.salt,
            schema_version = excluded.schema_version,
            updated_at = excluded.updated_at
        `).bind(
          user.user_id,
          ciphertext,
          iv,
          salt,
          schemaVersion,
          updatedAt
        ).run();

        return json({
          success: true,
          updated_at: updatedAt
        });
      } catch {
        return json({ error: "Could not save vault." }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;