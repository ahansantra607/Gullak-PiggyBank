import { randomUUID, randomBytes } from 'node:crypto';

const appUrl = (process.env.APP_URL || "https://gullak-piggybank.ahansantra607.workers.dev").replace(/\/$/, "");
const apiUrl = (process.env.API_URL || "https://server.ahansantra607.workers.dev").replace(/\/$/, "");
const origin = appUrl;
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const b64 = bytes => Buffer.from(bytes).toString("base64");
const encrypted = () => ({
  ciphertext: b64(randomBytes(32)),
  iv: b64(randomBytes(12)),
  salt: b64(randomBytes(16)),
  schema_version: 1
});
const cookieFrom = response => {
  const values = response.headers.getSetCookie?.() || [];
  const value = values.find(item => item.startsWith("gullak_session="));
  return value ? value.split(";")[0] : "";
};

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(apiUrl + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual", cache: "no-store"
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  return { response, data, cookie: cookieFrom(response) };
}
function expect(result, status, label) {
  assert(result.response.status === status,
    label + " expected HTTP " + status + " but got " + result.response.status + ": " + JSON.stringify(result.data));
  return result;
}

const app = await fetch(appUrl + "/", { redirect: "follow", cache: "no-store" });
assert(app.ok, "Deployed app returned HTTP " + app.status);
assert(/Gullak/i.test(await app.text()), "Deployed app HTML does not look like Gullak.");

const [cloudUi, cloudClient, health] = await Promise.all([
  fetch(appUrl + "/js/cloud-ui.js", { cache: "no-store" }),
  fetch(appUrl + "/js/cloud.js", { cache: "no-store" }),
  fetch(apiUrl + "/api/health", { cache: "no-store" })
]);
assert(cloudUi.ok && cloudClient.ok && health.ok, "A deployed frontend/API asset is unavailable.");
const uiText = await cloudUi.text();
const clientText = await cloudClient.text();
assert(uiText.includes("gullak-encrypted-backup") && uiText.includes("G.cloudAccount"),
  "Deployed frontend is stale or missing cloud account/backup code.");
assert(clientText.includes("/api/families/") && clientText.includes("/api/vault"),
  "Deployed frontend is missing cloud API integration.");
const healthData = await health.json();
assert(healthData.status === "healthy" && healthData.database === "connected" &&
  healthData.familySchema === "ready", "Cloud Worker health/schema check failed: " + JSON.stringify(healthData));

// Exercise real account registration, cookie sessions, encrypted vault isolation,
// family creation/linking, role enforcement, member vaults, and logout.
const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const supervisorName = "smokesup_" + suffix;
const memberName = "smokekid_" + suffix;
const password = "Smoke-test-account-" + randomUUID();
const familyName = "Smoke Family " + suffix;
const joinCode = "GULL" + randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();

const supervisor = expect(await request("/api/register", {
  method: "POST", body: { username: supervisorName, password }
}), 201, "Supervisor registration");
assert(supervisor.cookie, "Registration did not issue an HttpOnly session cookie.");
assert(supervisor.response.headers.get("access-control-allow-origin") === origin,
  "Registration response is missing the expected CORS origin.");
const member = expect(await request("/api/register", {
  method: "POST", body: { username: memberName, password: "Member-" + password }
}), 201, "Member registration");
assert(member.cookie, "Member registration did not issue a session cookie.");

const me = expect(await request("/api/me", { cookie: supervisor.cookie }), 200, "Session check");
assert(me.data.authenticated && me.data.user.username === supervisorName, "Session identity mismatch.");

const privateVault = encrypted();
expect(await request("/api/vault", { method: "PUT", cookie: supervisor.cookie, body: privateVault }), 200, "Encrypted vault save");
const ownVault = expect(await request("/api/vault", { cookie: supervisor.cookie }), 200, "Encrypted vault read");
assert(ownVault.data.exists && ownVault.data.vault.ciphertext === privateVault.ciphertext,
  "Encrypted vault read did not return the saved ciphertext.");
const isolatedVault = expect(await request("/api/vault", { cookie: member.cookie }), 200, "Other user's vault read");
assert(!isolatedVault.data.exists, "A different account could read another user's vault.");

const familyVault = encrypted();
const familyKeyWrap = b64(randomBytes(12)) + "." + b64(randomBytes(48));
const family = expect(await request("/api/families", {
  method: "POST", cookie: supervisor.cookie,
  body: {
    name: familyName, join_code: joinCode, family_key_wrap: familyKeyWrap,
    key_wrap_salt: b64(randomBytes(16)), key_wrap_iterations: 310000,
    vault: familyVault
  }
}), 201, "Family creation");
const familyId = family.data.family.family_id;
assert(familyId, "Family creation returned no family ID.");

const linked = expect(await request("/api/families/" + encodeURIComponent(familyId) + "/members", {
  method: "POST", cookie: supervisor.cookie,
  body: { username: memberName, role: "member" }
}), 200, "Link family member");
assert(linked.data.member.user_id === member.data.user.user_id, "Family linked the wrong account.");

const directory = expect(await request("/api/families/search?q=" + encodeURIComponent(familyName), {
  cookie: member.cookie
}), 200, "Family directory search");
assert(directory.data.families.some(item => item.family_id === familyId), "New family is missing from directory search.");

const memberFamilyVault = expect(await request("/api/families/" + familyId + "/vault", {
  cookie: member.cookie
}), 200, "Member family-vault read");
assert(memberFamilyVault.data.exists, "Linked member cannot read the encrypted family vault.");
expect(await request("/api/families/" + familyId + "/vault", {
  method: "PUT", cookie: member.cookie, body: encrypted()
}), 403, "Member supervisor-only write denial");

const memberPrivate = encrypted();
expect(await request("/api/families/" + familyId + "/member-vault", {
  method: "PUT", cookie: member.cookie, body: memberPrivate
}), 200, "Member's own vault save");
const ownMemberData = expect(await request("/api/families/" + familyId + "/member-vault", {
  cookie: member.cookie
}), 200, "Member's own vault read");
assert(ownMemberData.data.exists && ownMemberData.data.vault.ciphertext === memberPrivate.ciphertext,
  "Member's own encrypted data did not round-trip.");
expect(await request("/api/families/" + familyId + "/member-vault?user_id=" +
  encodeURIComponent(supervisor.data.user.user_id), { cookie: member.cookie }),
  403, "Member cross-account data denial");

const supervisorMemberData = expect(await request("/api/families/" + familyId +
  "/member-vault?user_id=" + encodeURIComponent(member.data.user.user_id), {
    cookie: supervisor.cookie
  }), 200, "Supervisor member-vault read");
assert(supervisorMemberData.data.exists, "Supervisor cannot read linked member's encrypted vault.");

expect(await request("/api/logout", { method: "POST", cookie: member.cookie }), 200, "Logout");
expect(await request("/api/me", { cookie: member.cookie }), 401, "Revoked session denial");

// Mutating requests without an Origin must be rejected (CSRF hardening).
const noOrigin = await fetch(apiUrl + "/api/logout", {
  method: "POST", headers: { Cookie: supervisor.cookie }, cache: "no-store"
});
assert(noOrigin.status === 403, "Mutation without an Origin header was not rejected.");

console.log("Live deployment integration tests passed.");
console.log("Frontend:", appUrl);
console.log("Cloud API:", apiUrl);
console.log("Family schema:", healthData.familySchema);
console.log("Verified: registration/login sessions, encrypted vault isolation, family directory/linking, role permissions, member vaults, logout, and Origin enforcement.");
