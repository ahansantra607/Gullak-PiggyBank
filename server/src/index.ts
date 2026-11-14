
const ITERATIONS = 310_000;
const SESSION_DAYS = 7;
const encoder = new TextEncoder();
const MAX_VAULT_BYTES = 900_000;

const APP_ORIGIN = "https://gullak-piggybank.ahansantra607.workers.dev";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
            "Set-Cookie": sessionCookie(token, request),
            ...CORS_HEADERS
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


    // CLOUD FAMILY DIRECTORY AND ENCRYPTED FAMILY VAULTS
    if (path.startsWith("/api/families")) {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);

        const validEncrypted = (value: any) => {
          if (!value || typeof value !== "object") return false;
          const ciphertext = String(value.ciphertext || "");
          const iv = String(value.iv || "");
          const salt = String(value.salt || "");
          const version = value.schema_version;
          if (!Number.isInteger(version) || version < 1 || version > 100) return false;
          if (!validBase64(ciphertext) || !validBase64(iv) || !validBase64(salt)) return false;
          const ct = fromBase64(ciphertext);
          return ct.length >= 16 && ct.length <= MAX_VAULT_BYTES &&
            fromBase64(iv).length === 12 && fromBase64(salt).length === 16;
        };

        if (path === "/api/families" && request.method === "GET") {
          const rows = await env.gullak_db.prepare(`
            SELECT f.family_id, f.name, m.role, f.created_at
            FROM cloud_families f
            JOIN cloud_family_members m ON m.family_id = f.family_id
            WHERE m.user_id = ?
            ORDER BY f.created_at DESC
          `).bind(user.user_id).all();
          return json({ families: rows.results || [] });
        }

        if (path === "/api/families/search" && request.method === "GET") {
          const raw = (url.searchParams.get("q") || "").trim();
          if (raw.length < 2 || raw.length > 64) {
            return json({ error: "Enter at least 2 characters to search." }, 400);
          }
          const nameQuery = raw.replace(/[\\%_]/g, "") + "%";
          const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^GULL/, "");
          const codeHash = code.length >= 8 ? await sha256(code) : "";
          const rows = await env.gullak_db.prepare(`
            SELECT f.family_id, f.name, f.created_at,
              CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS is_member
            FROM cloud_families f
            LEFT JOIN cloud_family_members m
              ON m.family_id = f.family_id AND m.user_id = ?
            WHERE f.name LIKE ? OR (? <> '' AND f.join_code_hash = ?)
            ORDER BY CASE WHEN f.join_code_hash = ? THEN 0 ELSE 1 END,
              f.created_at DESC
            LIMIT 20
          `).bind(user.user_id, nameQuery, codeHash, codeHash, codeHash).all();
          return json({ families: rows.results || [] });
        }

        if (path === "/api/families" && request.method === "POST") {
          const body = await request.json() as any;
          const name = String(body.name || "").trim();
          const joinCode = String(body.join_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const keyWrap = String(body.family_key_wrap || "");
          const keySalt = String(body.key_wrap_salt || "");
          const keyIterations = Number(body.key_wrap_iterations);
          if (name.length < 2 || name.length > 40) {
            return json({ error: "Family name must be 2–40 characters." }, 400);
          }
          if (joinCode.length < 8 || joinCode.length > 64) {
            return json({ error: "Invalid family invite code." }, 400);
          }
          const wrapParts = keyWrap.split(".");
          if (wrapParts.length !== 2 || !validBase64(wrapParts[0]) ||
              !validBase64(wrapParts[1]) || fromBase64(wrapParts[0]).length !== 12 ||
              fromBase64(wrapParts[1]).length < 16 || fromBase64(wrapParts[1]).length > 256 ||
              !validBase64(keySalt) || fromBase64(keySalt).length !== 16 ||
              !Number.isInteger(keyIterations) || keyIterations < 100000 || keyIterations > 1000000) {
            return json({ error: "Invalid encrypted family key." }, 400);
          }
          if (!validEncrypted(body.vault)) return json({ error: "Invalid encrypted family vault." }, 400);
          const familyId = "f" + crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();
          const codeHash = await sha256(joinCode);
          const v = body.vault;
          await env.gullak_db.batch([
            env.gullak_db.prepare(`
              INSERT INTO cloud_families (
                family_id, name, join_code_hash, family_key_wrap, key_wrap_salt,
                key_wrap_iterations, created_by, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(familyId, name, codeHash, keyWrap, keySalt, keyIterations, user.user_id, now),
            env.gullak_db.prepare(`
              INSERT INTO cloud_family_members (family_id, user_id, role, joined_at)
              VALUES (?, ?, 'supervisor', ?)
            `).bind(familyId, user.user_id, now),
            env.gullak_db.prepare(`
              INSERT INTO cloud_family_vaults (
                family_id, ciphertext, iv, salt, schema_version, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).bind(familyId, v.ciphertext, v.iv, v.salt, v.schema_version, now)
          ]);
          return json({ success: true, family: { family_id: familyId, name, role: "supervisor" } }, 201);
        }

        const match = path.match(/^\/api\/families\/([^/]+)(?:\/(join|members|vault|member-vault|code))?$/);
        if (!match) return json({ error: "Not found." }, 404);
        const familyId = decodeURIComponent(match[1]);
        const action = match[2] || "";
        const family = await env.gullak_db.prepare(`
          SELECT family_id, name, join_code_hash, family_key_wrap,
                 key_wrap_salt, key_wrap_iterations
          FROM cloud_families WHERE family_id = ?
        `).bind(familyId).first<any>();
        if (!family) return json({ error: "Family not found." }, 404);

        const membership = await env.gullak_db.prepare(`
          SELECT role FROM cloud_family_members WHERE family_id = ? AND user_id = ?
        `).bind(familyId, user.user_id).first<{ role: string }>();

        if (!action && request.method === "PUT") {
          if (!membership || membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          const body = await request.json() as { name?: string };
          const name = String(body.name || "").trim();
          if (name.length < 2 || name.length > 40) return json({ error: "Family name must be 2–40 characters." }, 400);
          await env.gullak_db.prepare("UPDATE cloud_families SET name = ? WHERE family_id = ?").bind(name, familyId).run();
          return json({ success: true, name });
        }

        if (!action && request.method === "DELETE") {
          if (!membership || membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          await env.gullak_db.prepare("DELETE FROM cloud_families WHERE family_id = ?").bind(familyId).run();
          return json({ success: true });
        }

        if (action === "code" && request.method === "PUT") {
          if (!membership || membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          const body = await request.json() as { join_code?: string; family_key_wrap?: string; key_wrap_salt?: string; key_wrap_iterations?: number };
          const code = String(body.join_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const parts = String(body.family_key_wrap || "").split(".");
          const salt = String(body.key_wrap_salt || "");
          const iterations = Number(body.key_wrap_iterations);
          if (code.length < 8 || code.length > 64 || parts.length !== 2 ||
              !validBase64(parts[0]) || !validBase64(parts[1]) ||
              fromBase64(parts[0]).length !== 12 || fromBase64(parts[1]).length < 16 ||
              !validBase64(salt) || fromBase64(salt).length !== 16 ||
              !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
            return json({ error: "Invalid new family recovery code." }, 400);
          }
          await env.gullak_db.prepare(`
            UPDATE cloud_families SET join_code_hash = ?, family_key_wrap = ?,
              key_wrap_salt = ?, key_wrap_iterations = ? WHERE family_id = ?
          `).bind(await sha256(code), String(body.family_key_wrap), salt, iterations, familyId).run();
          return json({ success: true });
        }

        if (action === "join" && request.method === "POST") {
          const body = await request.json() as { join_code?: string };
          const code = String(body.join_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!code || !constantTimeEqual(await sha256(code), family.join_code_hash)) {
            return json({ error: "That family code is not correct." }, 403);
          }
          await env.gullak_db.prepare(`
            INSERT OR IGNORE INTO cloud_family_members (family_id, user_id, role, joined_at)
            VALUES (?, ?, 'member', ?)
          `).bind(familyId, user.user_id, new Date().toISOString()).run();
          return json({ success: true, family: { family_id: familyId, name: family.name, role: membership?.role || "member" } });
        }

        if (!membership) return json({ error: "You are not a member of this family." }, 403);

        if (action === "members" && request.method === "GET") {
          const rows = await env.gullak_db.prepare(`
            SELECT u.user_id, u.username, m.role, m.joined_at
            FROM cloud_family_members m JOIN users u ON u.user_id = m.user_id
            WHERE m.family_id = ? ORDER BY m.joined_at
          `).bind(familyId).all();
          return json({ members: rows.results || [] });
        }

        if (action === "members" && request.method === "POST") {
          if (membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          const body = await request.json() as { username?: string; role?: string };
          const username = String(body.username || "").trim().toLowerCase();
          const role = body.role === "supervisor" ? "supervisor" : "member";
          if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: "Enter a valid account username." }, 400);
          const target = await env.gullak_db.prepare(
            "SELECT user_id, username FROM users WHERE username = ?"
          ).bind(username).first<{ user_id: string; username: string }>();
          if (!target) return json({ error: "No Gullak account has that username yet." }, 404);
          await env.gullak_db.prepare(`
            INSERT OR IGNORE INTO cloud_family_members (family_id, user_id, role, joined_at)
            VALUES (?, ?, ?, ?)
          `).bind(familyId, target.user_id, role, new Date().toISOString()).run();
          return json({ success: true, member: { user_id: target.user_id, username: target.username, role } });
        }

        if (action === "members" && request.method === "DELETE") {
          if (membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          const body = await request.json() as { user_id?: string };
          const targetId = String(body.user_id || "");
          if (!targetId || targetId === user.user_id) return json({ error: "You cannot remove your own account here." }, 400);
          const target = await env.gullak_db.prepare(
            "SELECT role FROM cloud_family_members WHERE family_id = ? AND user_id = ?"
          ).bind(familyId, targetId).first<{ role: string }>();
          if (!target) return json({ error: "Family member not found." }, 404);
          if (target.role === "supervisor") {
            const count = await env.gullak_db.prepare(
              "SELECT COUNT(*) AS total FROM cloud_family_members WHERE family_id = ? AND role = 'supervisor'"
            ).bind(familyId).first<{ total: number }>();
            if ((count?.total || 0) <= 1) return json({ error: "A family needs at least one supervisor." }, 400);
          }
          await env.gullak_db.prepare(
            "DELETE FROM cloud_family_members WHERE family_id = ? AND user_id = ?"
          ).bind(familyId, targetId).run();
          return json({ success: true });
        }

        if (action === "vault" && request.method === "GET") {
          const vault = await env.gullak_db.prepare(`
            SELECT ciphertext, iv, salt, schema_version, updated_at
            FROM cloud_family_vaults WHERE family_id = ?
          `).bind(familyId).first();
          return json({
            exists: !!vault, vault: vault || null,
            family_key_wrap: family.family_key_wrap,
            key_wrap_salt: family.key_wrap_salt,
            key_wrap_iterations: family.key_wrap_iterations
          });
        }

        if (action === "vault" && request.method === "PUT") {
          if (membership.role !== "supervisor") return json({ error: "Supervisor permission required." }, 403);
          const body = await request.json() as any;
          if (!validEncrypted(body)) return json({ error: "Invalid encrypted family vault." }, 400);
          const updatedAt = new Date().toISOString();
          await env.gullak_db.prepare(`
            INSERT INTO cloud_family_vaults (
              family_id, ciphertext, iv, salt, schema_version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(family_id) DO UPDATE SET
              ciphertext = excluded.ciphertext, iv = excluded.iv,
              salt = excluded.salt, schema_version = excluded.schema_version,
              updated_at = excluded.updated_at
          `).bind(familyId, body.ciphertext, body.iv, body.salt, body.schema_version, updatedAt).run();
          return json({ success: true, updated_at: updatedAt });
        }

        if (action === "member-vault" && (request.method === "GET" || request.method === "PUT")) {
          const putBody = request.method === "PUT" ? await request.clone().json() as { user_id?: string } : null;
          const targetId = request.method === "GET"
            ? (url.searchParams.get("user_id") || user.user_id)
            : (putBody?.user_id || user.user_id);
          if (targetId !== user.user_id && membership.role !== "supervisor") {
            return json({ error: "You may only access your own member data." }, 403);
          }
          const targetMember = await env.gullak_db.prepare(
            "SELECT role FROM cloud_family_members WHERE family_id = ? AND user_id = ?"
          ).bind(familyId, targetId).first<{ role: string }>();
          if (!targetMember) return json({ error: "Family member not found." }, 404);
          if (request.method === "GET") {
            const vault = await env.gullak_db.prepare(`
              SELECT ciphertext, iv, salt, schema_version, updated_at
              FROM cloud_family_member_vaults WHERE family_id = ? AND user_id = ?
            `).bind(familyId, targetId).first();
            return json({ exists: !!vault, vault: vault || null });
          }
          const body = await request.json() as any;
          if (targetId !== user.user_id && membership.role !== "supervisor") {
            return json({ error: "Supervisor permission required to update another member." }, 403);
          }
          if (!validEncrypted(body)) return json({ error: "Invalid encrypted member vault." }, 400);
          const updatedAt = new Date().toISOString();
          await env.gullak_db.prepare(`
            INSERT INTO cloud_family_member_vaults (
              family_id, user_id, ciphertext, iv, salt, schema_version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(family_id, user_id) DO UPDATE SET
              ciphertext = excluded.ciphertext, iv = excluded.iv,
              salt = excluded.salt, schema_version = excluded.schema_version,
              updated_at = excluded.updated_at
          `).bind(familyId, targetId, body.ciphertext, body.iv, body.salt, body.schema_version, updatedAt).run();
          return json({ success: true, updated_at: updatedAt });
        }

        return json({ error: "Not found." }, 404);
      } catch (error) {
        console.error("Family API error", error);
        return json({ error: "Could not complete family request." }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;