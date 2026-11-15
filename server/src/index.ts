
const ITERATIONS = 100_000;
const SESSION_DAYS = 7;
const encoder = new TextEncoder();
const MAX_VAULT_BYTES = 900_000;

const APP_ORIGIN = "https://gullak-piggybank.ahansantra607.workers.dev";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Gullak-Android",
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

  const sameSite = request.headers.get("X-Gullak-Android") === "1" ? "None" : "Strict";
  return `gullak_session=${token}; HttpOnly${secure}; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  const sameSite = request.headers.get("X-Gullak-Android") === "1" ? "None" : "Strict";
  return `gullak_session=; HttpOnly${secure}; SameSite=${sameSite}; Path=/; Max-Age=0`;
}

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

async function individualRole(env: Env, userId: string): Promise<{ role: "supervisor" | "kid"; status: "active" | "pending" } | null> {
  return env.gullak_db.prepare("SELECT role, status FROM individual_account_roles WHERE user_id = ?").bind(userId).first<{ role: "supervisor" | "kid"; status: "active" | "pending" }>();
}
function makeSupervisorCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(10), byte => alphabet[byte % alphabet.length]).join("");
}
async function supervisorCodeHash(code: string): Promise<string> {
  return sha256("gullak-individual-supervisor:" + code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
}

async function getCurrentUserAccountType(env: Env, userId: string): Promise<"individual" | "family"> {
  const familyMember = await env.gullak_db.prepare(
    "SELECT 1 AS found FROM cloud_family_members WHERE user_id = ? LIMIT 1"
  ).bind(userId).first<{ found: number }>();
  if (familyMember) return "family";
  const row = await env.gullak_db.prepare(
    "SELECT account_type FROM user_account_types WHERE user_id = ?"
  ).bind(userId).first<{ account_type: "individual" | "family" }>();
  return row?.account_type === "family" ? "family" : "individual";
}

async function getCurrentUser(
  request: Request,
  env: Env
): Promise<{ user_id: string; username: string; account_type: "individual" | "family" } | null> {
  const token = getCookie(request, "gullak_session");
  if (!token || token.length > 200) return null;

  const tokenHash = await sha256(token);

  const session = await env.gullak_db
    .prepare(`
      SELECT users.user_id, users.username,
        CASE
          WHEN EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = users.user_id) THEN 'family'
          ELSE COALESCE((SELECT account_type FROM user_account_types uat WHERE uat.user_id = users.user_id), 'individual')
        END AS account_type
      FROM sessions
      JOIN users ON users.user_id = sessions.user_id
      WHERE sessions.session_id_hash = ?
        AND sessions.expires_at > ?
    `)
    .bind(tokenHash, new Date().toISOString())
    .first<{ user_id: string; username: string; account_type: "individual" | "family" }>();

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

        const requiredTables = [
          "users", "sessions", "user_vaults", "user_account_types",
          "cloud_families", "cloud_family_members",
          "cloud_family_vaults", "cloud_family_member_vaults", "user_key_wraps"
        ];
        const tableChecks = await Promise.all(requiredTables.map(name =>
          env.gullak_db.prepare(
            "SELECT name FROM sqlite_master WHERE type = ? AND name = ?"
          ).bind("table", name).first()
        ));
        const requiredColumns: Record<string, string[]> = {
          users: ["user_id", "username", "password_salt", "password_hash", "password_iterations", "created_at"],
          user_account_types: ["user_id", "account_type", "created_at"],
          sessions: ["session_id_hash", "user_id", "created_at", "expires_at"],
          user_vaults: ["user_id", "ciphertext", "iv", "salt", "schema_version", "updated_at"]
        };
        const columnChecks = await Promise.all(Object.entries(requiredColumns).map(async ([table, expected]) => {
          const result = await env.gullak_db.prepare("PRAGMA table_info(" + table + ")").all<{ name: string }>();
          const actual = new Set((result.results || []).map(row => row.name));
          return expected.filter(name => !actual.has(name)).map(name => table + "." + name);
        }));
        const missingColumns = columnChecks.flat();
        const tablesReady = tableChecks.every(Boolean);
        const familySchemaReady = tableChecks.slice(4).every(Boolean);
        const authSchemaReady = !!tableChecks[0] && !!tableChecks[1] && missingColumns.length === 0;
        const allReady = tablesReady && missingColumns.length === 0;

        return json({
          status: allReady ? "healthy" : "error",
          database: "connected",
          authSchema: authSchemaReady ? "ready" : "migration_required",
          vaultTable: tableChecks[2] && !missingColumns.some(name => name.startsWith("user_vaults.")) ? "ready" : "migration_required",
          familySchema: familySchemaReady ? "ready" : "migration_required",
          schemaIssues: missingColumns
        }, allReady ? 200 : 500);
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

    // Family registration is unchanged. Individual accounts choose Supervisor or Kid.
    if ((path === "/api/register" || path === "/api/family/register") && request.method === "POST") {
      const accountType = path === "/api/family/register" ? "family" : "individual";
      try {
        const body = await request.json() as { username?: string; password?: string; role?: string; supervisor_codes?: string[]; key_wrap?: { wrapped_secret?: string; salt?: string; iterations?: number } };
        const username = body.username?.trim().toLowerCase() || "";
        const password = body.password || "";
        const role = accountType === "individual" ? body.role : undefined;
        if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: "Username must be 3–24 characters using letters, numbers or underscores." }, 400);
        if (password.length < 8 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9 ]/.test(password) && !password.includes("_") && !password.includes("!") && !password.includes("@") && !password.includes("#") && !password.includes("$") && !password.includes("%") && !password.includes("^") && !password.includes("&") && !password.includes("*") && !password.includes("-") && !password.includes("+") && !password.includes("=") && !password.includes(".") && !password.includes("?")) return json({ error: "Password must be at least 8 characters and include uppercase, lowercase, a number and a special character." }, 400);
        if (accountType === "individual" && role !== "supervisor" && role !== "kid") return json({ error: "Choose Supervisor or Kid account." }, 400);

        const supervisors: string[] = [];
        if (role === "kid") {
          const codes = Array.isArray(body.supervisor_codes) ? [...new Set(body.supervisor_codes.map(v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean))] : [];
          if (!codes.length || codes.length > 5) return json({ error: "Enter at least one Supervisor code (up to five)." }, 400);
          for (const code of codes) {
            if (code.length !== 10) return json({ error: "One of the Supervisor codes is not valid." }, 400);
            const hash = await supervisorCodeHash(code);
            const row = await env.gullak_db.prepare("SELECT c.supervisor_user_id FROM individual_supervisor_codes c JOIN individual_account_roles r ON r.user_id = c.supervisor_user_id WHERE c.code_hash = ? AND c.revoked_at IS NULL AND r.role = 'supervisor' AND r.status = 'active'")
              .bind(hash).first<{ supervisor_user_id: string }>();
            if (!row) return json({ error: "A Supervisor code is invalid or no longer active." }, 400);
            supervisors.push(row.supervisor_user_id);
          }
        }

        let keyWrap: { wrapped_secret: string; salt: string; iterations: number } | null = null;
        if (role === "kid") {
          const candidate = body.key_wrap || {};
          const parts = String(candidate.wrapped_secret || "").split(".");
          const wrapSalt = String(candidate.salt || "");
          const iterations = Number(candidate.iterations);
          if (parts.length !== 2 || !validBase64(parts[0]) || !validBase64(parts[1]) || !validBase64(wrapSalt) || fromBase64(parts[0]).length !== 12 || fromBase64(wrapSalt).length !== 16 || fromBase64(parts[1]).length < 16 || !Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return json({ error: "Could not securely prepare the Kid account's encryption key." }, 400);
          keyWrap = { wrapped_secret: candidate.wrapped_secret!, salt: wrapSalt, iterations };
        }

        const salt = randomBytes(16);
        const passwordHash = await derivePasswordHash(password, salt, ITERATIONS);
        const userId = crypto.randomUUID();
        const now = new Date().toISOString();
        const token = accountType === "family" || role === "supervisor" ? toBase64(randomBytes(32)) : "";
        const tokenHash = token ? await sha256(token) : "";
        const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
        const statements: D1PreparedStatement[] = [
          env.gullak_db.prepare("INSERT INTO users (user_id, username, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(userId, username, toBase64(salt), passwordHash, ITERATIONS, now),
          env.gullak_db.prepare("INSERT INTO user_account_types (user_id, account_type, created_at) VALUES (?, ?, ?)")
            .bind(userId, accountType, now)
        ];
        if (accountType === "individual") {
          statements.push(env.gullak_db.prepare("INSERT INTO individual_account_roles (user_id, role, status, created_at) VALUES (?, ?, ?, ?)")
            .bind(userId, role, role === "supervisor" ? "active" : "pending", now));
          if (role === "supervisor") {
            const code = makeSupervisorCode();
            statements.push(env.gullak_db.prepare("INSERT INTO individual_supervisor_codes (code_hash, supervisor_user_id, created_at, revoked_at) VALUES (?, ?, ?, NULL)")
              .bind(await supervisorCodeHash(code), userId, now));
            statements.push(env.gullak_db.prepare("INSERT INTO sessions (session_id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
              .bind(tokenHash, userId, now, expires));
            await env.gullak_db.batch(statements);
            return new Response(JSON.stringify({ success: true, role: "supervisor", supervisor_code: code, user: { user_id: userId, username, account_type: "individual", role: "supervisor", status: "active" } }), {
              status: 201, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(token, request), ...CORS_HEADERS }
            });
          }
          for (const supervisorId of supervisors) statements.push(env.gullak_db.prepare("INSERT INTO individual_supervisor_links (link_id, kid_user_id, supervisor_user_id, status, created_at, responded_at) VALUES (?, ?, ?, 'pending', ?, NULL)")
            .bind(crypto.randomUUID(), userId, supervisorId, now));
          statements.push(env.gullak_db.prepare("INSERT INTO user_key_wraps (user_id, wrapped_secret, salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(userId, keyWrap!.wrapped_secret, keyWrap!.salt, keyWrap!.iterations, now));
          await env.gullak_db.batch(statements);
          return json({ success: true, pending_approval: true, user: { user_id: userId, username, account_type: "individual", role: "kid", status: "pending" }, message: "Your account is waiting for at least one Supervisor to accept." }, 201);
        }
        if (token) statements.push(env.gullak_db.prepare("INSERT INTO sessions (session_id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
          .bind(tokenHash, userId, now, expires));
        await env.gullak_db.batch(statements);
        return new Response(JSON.stringify({ success: true, user: { user_id: userId, username, account_type: accountType } }), {
          status: 201, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(token, request), ...CORS_HEADERS }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Gullak account registration failed:", message);
        if (message.includes("UNIQUE")) return json({ error: "That username or Supervisor link already exists." }, 409);
        return json({ error: "Could not create account." }, 400);
      }
    }

    // LOGIN: credentials are valid only in their own mode.
    if ((path === "/api/login" || path === "/api/family/login") && request.method === "POST") {
      const expectedAccountType = path === "/api/family/login" ? "family" : "individual";
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
        const accountIdentity = await getCurrentUserAccountType(env, user.user_id);
        if (accountIdentity !== expectedAccountType) return json({ error: "These credentials belong to a different Gullak mode." }, 403);
        if (expectedAccountType === "individual") {
          const role = await individualRole(env, user.user_id);
          if (!role) return json({ error: "This old Individual account has been retired. Create a new Supervisor or Kid account." }, 403);
          if (role.status !== "active") return json({ error: "Your Kid account is waiting for a Supervisor to accept your request. You can log in after at least one Supervisor approves." }, 403);
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
            username: user.username,
            account_type: expectedAccountType
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

    // Individual-only Supervisor/Kid relationship management.
    if (path === "/api/individual/supervision" && request.method === "GET") {
      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "Authentication required." }, 401);
      if (user.account_type !== "individual") return json({ error: "This feature is only for Individual accounts." }, 403);
      const role = await individualRole(env, user.user_id);
      if (!role) return json({ error: "Individual role not found." }, 403);
      const supervisorView = role.role === "supervisor";
      const sql = supervisorView
        ? "SELECT l.link_id, l.status, l.created_at, l.responded_at, u.user_id AS other_user_id, u.username AS other_username FROM individual_supervisor_links l JOIN users u ON u.user_id = l.kid_user_id WHERE l.supervisor_user_id = ? ORDER BY l.created_at DESC"
        : "SELECT l.link_id, l.status, l.created_at, l.responded_at, u.user_id AS other_user_id, u.username AS other_username FROM individual_supervisor_links l JOIN users u ON u.user_id = l.supervisor_user_id WHERE l.kid_user_id = ? ORDER BY l.created_at ASC";
      const rows = await env.gullak_db.prepare(sql).bind(user.user_id).all();
      return json({ role: role.role, status: role.status, links: rows.results || [] });
    }

    if (path === "/api/individual/supervision/code" && request.method === "POST") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        if (user.account_type !== "individual") return json({ error: "This feature is only for Individual accounts." }, 403);
        const role = await individualRole(env, user.user_id);
        if (!role || role.role !== "supervisor" || role.status !== "active") return json({ error: "Only an active Supervisor can create a code." }, 403);
        const code = makeSupervisorCode();
        const now = new Date().toISOString();
        const hash = await supervisorCodeHash(code);
        await env.gullak_db.batch([
          env.gullak_db.prepare("UPDATE individual_supervisor_codes SET revoked_at = ? WHERE supervisor_user_id = ? AND revoked_at IS NULL").bind(now, user.user_id),
          env.gullak_db.prepare("INSERT INTO individual_supervisor_codes (code_hash, supervisor_user_id, created_at, revoked_at) VALUES (?, ?, ?, NULL)").bind(hash, user.user_id, now)
        ]);
        return json({ success: true, code });
      } catch { return json({ error: "Could not generate a Supervisor code." }, 400); }
    }

    if (path === "/api/individual/supervision/requests" && request.method === "POST") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        if (user.account_type !== "individual") return json({ error: "This feature is only for Individual accounts." }, 403);
        const role = await individualRole(env, user.user_id);
        if (!role || role.role !== "kid" || role.status !== "active") return json({ error: "Only an active Kid account can request another Supervisor." }, 403);
        const body = await request.json() as { code?: string };
        const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 10) return json({ error: "Enter a valid 10-character Supervisor code." }, 400);
        const hash = await supervisorCodeHash(code);
        const supervisor = await env.gullak_db.prepare("SELECT c.supervisor_user_id FROM individual_supervisor_codes c JOIN individual_account_roles r ON r.user_id = c.supervisor_user_id WHERE c.code_hash = ? AND c.revoked_at IS NULL AND r.role = 'supervisor' AND r.status = 'active'")
          .bind(hash).first<{ supervisor_user_id: string }>();
        if (!supervisor) return json({ error: "That Supervisor code is invalid or expired." }, 404);
        if (supervisor.supervisor_user_id === user.user_id) return json({ error: "You cannot add yourself as a Supervisor." }, 400);
        const existing = await env.gullak_db.prepare("SELECT status FROM individual_supervisor_links WHERE kid_user_id = ? AND supervisor_user_id = ?").bind(user.user_id, supervisor.supervisor_user_id).first<{ status: string }>();
        if (existing) return json({ error: existing.status === "accepted" ? "This person is already your Supervisor." : "A request to this Supervisor already exists." }, 409);
        await env.gullak_db.prepare("INSERT INTO individual_supervisor_links (link_id, kid_user_id, supervisor_user_id, status, created_at, responded_at) VALUES (?, ?, ?, 'pending', ?, NULL)")
          .bind(crypto.randomUUID(), user.user_id, supervisor.supervisor_user_id, new Date().toISOString()).run();
        return json({ success: true, status: "pending" }, 201);
      } catch { return json({ error: "Could not send the Supervisor request." }, 400); }
    }

    const supervisionDecision = path.match(/^\/api\/individual\/supervision\/requests\/([0-9a-f-]+)$/i);
    if (supervisionDecision && request.method === "POST") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        if (user.account_type !== "individual") return json({ error: "This feature is only for Individual accounts." }, 403);
        const role = await individualRole(env, user.user_id);
        if (!role || role.role !== "supervisor" || role.status !== "active") return json({ error: "Only an active Supervisor can respond." }, 403);
        const body = await request.json() as { decision?: string };
        if (body.decision !== "accept" && body.decision !== "reject") return json({ error: "Choose accept or reject." }, 400);
        const linkId = supervisionDecision[1];
        const link = await env.gullak_db.prepare("SELECT kid_user_id, status FROM individual_supervisor_links WHERE link_id = ? AND supervisor_user_id = ?").bind(linkId, user.user_id).first<{ kid_user_id: string; status: string }>();
        if (!link) return json({ error: "This request does not belong to your account." }, 404);
        if (link.status !== "pending") return json({ error: "This request has already been answered." }, 409);
        const nextStatus = body.decision === "accept" ? "accepted" : "rejected";
        const now = new Date().toISOString();
        const statements: D1PreparedStatement[] = [
          env.gullak_db.prepare("UPDATE individual_supervisor_links SET status = ?, responded_at = ? WHERE link_id = ? AND supervisor_user_id = ? AND status = 'pending'").bind(nextStatus, now, linkId, user.user_id)
        ];
        if (nextStatus === "accepted") statements.push(env.gullak_db.prepare("UPDATE individual_account_roles SET status = 'active' WHERE user_id = ? AND role = 'kid'").bind(link.kid_user_id));
        await env.gullak_db.batch(statements);
        return json({ success: true, status: nextStatus });
      } catch { return json({ error: "Could not update this Supervisor request." }, 400); }
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

    // Android-only account PIN. Its verifier is shared across devices for this account.
    if (path === "/api/mobile-pin/status" && request.method === "GET") {
      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "Authentication required." }, 401);
      const row = await env.gullak_db.prepare("SELECT 1 AS configured FROM user_mobile_pins WHERE user_id = ?").bind(user.user_id).first<{ configured: number }>();
      return json({ configured: !!row });
    }
    if (path === "/api/mobile-pin/setup" && request.method === "POST") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        const body = await request.json() as { pin?: string };
        const pin = String(body.pin || "");
        if (!/^\d{6}$/.test(pin)) return json({ error: "PIN must contain exactly six digits." }, 400);
        const salt = randomBytes(16);
        const hash = await derivePasswordHash(pin, salt, ITERATIONS);
        const now = new Date().toISOString();
        await env.gullak_db.prepare("INSERT INTO user_mobile_pins (user_id, pin_salt, pin_hash, failed_attempts, locked_until, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, ?, ?)").bind(user.user_id, toBase64(salt), hash, now, now).run();
        return json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UNIQUE")) return json({ error: "A phone PIN is already set for this account. Enter that PIN instead." }, 409);
        return json({ error: "Could not set up the phone PIN." }, 400);
      }
    }
    if (path === "/api/mobile-pin/verify" && request.method === "POST") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        const body = await request.json() as { pin?: string };
        const pin = String(body.pin || "");
        if (!/^\d{6}$/.test(pin)) return json({ error: "Enter your six-digit PIN." }, 400);
        const row = await env.gullak_db.prepare("SELECT pin_salt, pin_hash, failed_attempts, locked_until FROM user_mobile_pins WHERE user_id = ?").bind(user.user_id).first<{ pin_salt: string; pin_hash: string; failed_attempts: number; locked_until: string | null }>();
        if (!row) return json({ error: "No phone PIN is configured for this account." }, 404);
        const now = new Date();
        if (row.locked_until && new Date(row.locked_until).getTime() > now.getTime()) return json({ error: "Too many incorrect attempts. Try again in a few minutes." }, 429);
        const calculated = await derivePasswordHash(pin, fromBase64(row.pin_salt), ITERATIONS);
        if (!constantTimeEqual(calculated, row.pin_hash)) {
          const failures = row.failed_attempts + 1;
          const lockedUntil = failures >= 5 ? new Date(now.getTime() + 5 * 60_000).toISOString() : null;
          await env.gullak_db.prepare("UPDATE user_mobile_pins SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE user_id = ?").bind(failures >= 5 ? 0 : failures, lockedUntil, now.toISOString(), user.user_id).run();
          return json({ error: lockedUntil ? "Too many incorrect attempts. Try again in five minutes." : "That PIN is incorrect." }, lockedUntil ? 429 : 403);
        }
        await env.gullak_db.prepare("UPDATE user_mobile_pins SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?").bind(now.toISOString(), user.user_id).run();
        return json({ success: true });
      } catch { return json({ error: "Could not verify the phone PIN." }, 400); }
    }

    // PERMANENT ACCOUNT DELETION. Password re-authentication is required.
    if (path === "/api/account" && request.method === "DELETE") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        const body = await request.json() as { password?: string };
        const password = String(body.password || "");
        if (!password || password.length > 128) return json({ error: "Enter your account password." }, 400);
        const credentials = await env.gullak_db.prepare(
          "SELECT password_salt, password_hash, password_iterations FROM users WHERE user_id = ?"
        ).bind(user.user_id).first<{ password_salt: string; password_hash: string; password_iterations: number }>();
        if (!credentials) return json({ error: "Account not found." }, 404);
        const calculated = await derivePasswordHash(password, fromBase64(credentials.password_salt), credentials.password_iterations);
        if (!constantTimeEqual(calculated, credentials.password_hash)) {
          return json({ error: "The account password is incorrect. Nothing has been deleted." }, 403);
        }

        const familyRows = await env.gullak_db.prepare(`
          SELECT f.family_id, f.created_by, m.role
          FROM cloud_families f
          LEFT JOIN cloud_family_members m
            ON m.family_id = f.family_id AND m.user_id = ?
          WHERE f.created_by = ? OR m.user_id = ?
        `).bind(user.user_id, user.user_id, user.user_id).all<{
          family_id: string; created_by: string; role: string | null;
        }>();

        const changes: D1PreparedStatement[] = [];
        for (const family of familyRows.results || []) {
          const remaining = await env.gullak_db.prepare(`
            SELECT user_id, role FROM cloud_family_members
            WHERE family_id = ? AND user_id <> ? ORDER BY joined_at ASC
          `).bind(family.family_id, user.user_id).all<{ user_id: string; role: string }>();
          const members = remaining.results || [];
          if (!members.length) {
            changes.push(env.gullak_db.prepare(
              "DELETE FROM cloud_families WHERE family_id = ?"
            ).bind(family.family_id));
            continue;
          }

          const existingSupervisor = members.find(member => member.role === "supervisor");
          if (family.created_by === user.user_id) {
            const successor = existingSupervisor || members[0];
            if (successor.role !== "supervisor") {
              changes.push(env.gullak_db.prepare(
                "UPDATE cloud_family_members SET role = 'supervisor' WHERE family_id = ? AND user_id = ?"
              ).bind(family.family_id, successor.user_id));
            }
            changes.push(env.gullak_db.prepare(
              "UPDATE cloud_families SET created_by = ? WHERE family_id = ?"
            ).bind(successor.user_id, family.family_id));
          } else if (family.role === "supervisor" && !existingSupervisor) {
            const successor = members[0];
            changes.push(env.gullak_db.prepare(
              "UPDATE cloud_family_members SET role = 'supervisor' WHERE family_id = ? AND user_id = ?"
            ).bind(family.family_id, successor.user_id));
          }
        }

        changes.push(env.gullak_db.prepare(
          "DELETE FROM users WHERE user_id = ?"
        ).bind(user.user_id));
        await env.gullak_db.batch(changes);

        return new Response(JSON.stringify({ success: true, deleted: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": clearSessionCookie(request),
            ...CORS_HEADERS
          }
        });
      } catch (error) {
        console.error("Gullak account deletion failed:", error);
        return json({ error: "Could not safely delete this account. No deletion was confirmed." }, 500);
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

    // Password-wrapped client encryption secret. The server stores only ciphertext.
    if (path === "/api/key-wrap" && request.method === "GET") {
      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "Authentication required." }, 401);
      const row = await env.gullak_db.prepare("SELECT wrapped_secret, salt, iterations FROM user_key_wraps WHERE user_id = ?").bind(user.user_id).first<{ wrapped_secret: string; salt: string; iterations: number }>();
      return json({ exists: !!row, key_wrap: row || null });
    }
    if (path === "/api/key-wrap" && request.method === "PUT") {
      try {
        const user = await getCurrentUser(request, env);
        if (!user) return json({ error: "Authentication required." }, 401);
        const body = await request.json() as { wrapped_secret?: string; salt?: string; iterations?: number };
        const parts = String(body.wrapped_secret || "").split(".");
        const salt = String(body.salt || "");
        const iterations = Number(body.iterations);
        if (parts.length !== 2 || !validBase64(parts[0]) || !validBase64(parts[1]) || !validBase64(salt) ||
            fromBase64(parts[0]).length !== 12 || fromBase64(salt).length !== 16 ||
            fromBase64(parts[1]).length < 16 || !Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return json({ error: "Invalid encrypted key wrapper." }, 400);
        await env.gullak_db.prepare("INSERT INTO user_key_wraps (user_id, wrapped_secret, salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET wrapped_secret = excluded.wrapped_secret, salt = excluded.salt, iterations = excluded.iterations, updated_at = excluded.updated_at").bind(user.user_id, body.wrapped_secret, salt, iterations, new Date().toISOString()).run();
        return json({ success: true });
      } catch { return json({ error: "Could not save the encrypted key wrapper." }, 400); }
    }

    // GET ENCRYPTED VAULT
    if (path === "/api/vault" && request.method === "GET") {
      try {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({ error: "Authentication required." }, 401);
        }
        if (user.account_type !== "individual") return json({ error: "Family accounts cannot access Individual diaries." }, 403);

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
        if (user.account_type !== "individual") return json({ error: "Family accounts cannot access Individual diaries." }, 403);

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
        const publicDirectoryRead = request.method === "GET" &&
          (path === "/api/families" || path === "/api/families/search");
        const publicFamilyVaultRead = request.method === "GET" &&
          path.startsWith("/api/families/") && path.endsWith("/vault");
        if (!user && !publicDirectoryRead && !publicFamilyVaultRead) {
          return json({ error: "Authentication required." }, 401);
        }

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
            SELECT f.family_id, f.name, m.role, f.created_at,
              CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS is_member
            FROM cloud_families f
            LEFT JOIN cloud_family_members m
              ON m.family_id = f.family_id AND m.user_id = ?
            WHERE f.name NOT LIKE 'Smoke Family %'
            ORDER BY f.created_at DESC
          `).bind(user?.user_id || "").all();
          return json({ families: rows.results || [] });
        }

        if (path === "/api/families/search" && request.method === "GET") {
          const raw = (url.searchParams.get("q") || "").trim();
          if (raw.length < 2 || raw.length > 64) {
            return json({ error: "Enter at least 2 characters to search." }, 400);
          }
          const nameQuery = raw.replace(/[\\%_]/g, "") + "%";
          const rows = await env.gullak_db.prepare(`
            SELECT f.family_id, f.name, f.created_at,
              CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS is_member
            FROM cloud_families f
            LEFT JOIN cloud_family_members m
              ON m.family_id = f.family_id AND m.user_id = ?
            WHERE f.name LIKE ? AND f.name NOT LIKE 'Smoke Family %'
            ORDER BY f.created_at DESC
            LIMIT 20
          `).bind(user?.user_id || "", nameQuery).all();
          return json({ families: rows.results || [] });
        }

        if (path === "/api/families" && request.method === "POST") {
          if (!user) return json({ error: "Authentication required." }, 401);
          if (user.account_type !== "family") return json({ error: "Use a Family account to create or manage cloud families." }, 403);
          const creatorId = user.user_id;
          const body = await request.json() as any;
          const name = String(body.name || "").trim();
          const joinCode = String(body.join_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const keyWrap = String(body.family_key_wrap || "");
          const keySalt = String(body.key_wrap_salt || "");
          const keyIterations = Number(body.key_wrap_iterations);
          if (name.length < 2 || name.length > 40) {
            return json({ error: "Family name must be 2–40 characters." }, 400);
          }
          if (!/^\d{4,6}$/.test(joinCode)) {
            return json({ error: "Family PIN must be 4–6 digits." }, 400);
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
            `).bind(familyId, name, codeHash, keyWrap, keySalt, keyIterations, creatorId, now),
            env.gullak_db.prepare(`
              INSERT INTO cloud_family_members (family_id, user_id, role, joined_at)
              VALUES (?, ?, 'supervisor', ?)
            `).bind(familyId, creatorId, now),
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

        if (!user) return json({ error: "Authentication required." }, 401);

        const membership = await env.gullak_db.prepare(`
          SELECT role FROM cloud_family_members WHERE family_id = ? AND user_id = ?
        `).bind(familyId, user?.user_id || "").first<{ role: string }>();

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
          if (!/^\d{4,6}$/.test(code) || parts.length !== 2 ||
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
          const body = await request.json() as { username?: string; password?: string; role?: string; wrapped_secret?: string; salt?: string; iterations?: number };
          const username = String(body.username || "").trim().toLowerCase();
          const password = String(body.password || "");
          const role = body.role === "supervisor" ? "supervisor" : "member";
          if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: "Enter a valid account username." }, 400);
          let target = await env.gullak_db.prepare(
            "SELECT user_id, username FROM users WHERE username = ?"
          ).bind(username).first<{ user_id: string; username: string }>();
          if (target && await getCurrentUserAccountType(env, target.user_id) !== "family") {
            return json({ error: "That username belongs to an Individual account. Create a new Family account for this member." }, 409);
          }
          if (!target && password) {
            if (password.length < 8 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) {
              return json({ error: "Password must be at least 8 characters and include uppercase, lowercase, a number and a special character." }, 400);
            }
            const wrapParts = String(body.wrapped_secret || "").split(".");
            const keySalt = String(body.salt || "");
            const keyIterations = Number(body.iterations);
            if (wrapParts.length !== 2 || !validBase64(wrapParts[0]) || !validBase64(wrapParts[1]) ||
                fromBase64(wrapParts[0]).length !== 12 || fromBase64(wrapParts[1]).length < 16 ||
                !validBase64(keySalt) || fromBase64(keySalt).length !== 16 ||
                !Number.isInteger(keyIterations) || keyIterations < 100000 || keyIterations > 500000) {
              return json({ error: "A valid encrypted account-key wrapper is required when creating a member account." }, 400);
            }
            const salt = randomBytes(16);
            const passwordHash = await derivePasswordHash(password, salt, ITERATIONS);
            const userId = crypto.randomUUID();
            const now = new Date().toISOString();
            await env.gullak_db.batch([
              env.gullak_db.prepare("INSERT INTO users (user_id, username, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(userId, username, toBase64(salt), passwordHash, ITERATIONS, now),
              env.gullak_db.prepare("INSERT INTO user_account_types (user_id, account_type, created_at) VALUES (?, 'family', ?)")
                .bind(userId, now),
              env.gullak_db.prepare("INSERT INTO user_key_wraps (user_id, wrapped_secret, salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?)")
                .bind(userId, String(body.wrapped_secret), keySalt, keyIterations, now),
              env.gullak_db.prepare("INSERT INTO cloud_family_members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)")
                .bind(familyId, userId, role, now)
            ]);
            target = { user_id: userId, username };
          } else if (target) {
            if (password) return json({ error: "That username already exists. Leave the password blank to link the existing account." }, 409);
            await env.gullak_db.prepare(
              "INSERT OR IGNORE INTO cloud_family_members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
            ).bind(familyId, target.user_id, role, new Date().toISOString()).run();
          } else {
            return json({ error: "Enter a password to create this member's Gullak account." }, 400);
          }
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