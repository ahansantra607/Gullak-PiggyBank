import { randomUUID, randomBytes, webcrypto } from 'node:crypto';

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
const encoder = new TextEncoder();
async function makeSupervisorKeyBundle(password) {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = new Uint8Array(await webcrypto.subtle.exportKey("spki", pair.publicKey));
  const privateBytes = new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey));
  const salt = randomBytes(16), iv = randomBytes(12);
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 150000 }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, privateBytes));
  return {
    body: { public_key: b64(publicKey), encrypted_private_key: b64(iv) + "." + b64(ciphertext), salt: b64(salt), iterations: 150000 },
    privateKey: pair.privateKey
  };
}
async function unlockSupervisorKeyBundle(password, bundle) {
  const [ivText, cipherText] = bundle.encrypted_private_key.split(".");
  const salt = Buffer.from(bundle.salt, "base64");
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: bundle.iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const privateBytes = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(ivText, "base64") }, key, Buffer.from(cipherText, "base64"));
  return webcrypto.subtle.importKey("pkcs8", privateBytes, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

function makeRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(32);
  let body = "";
  for (let i = 0; i < bytes.length; i++) {
    body += alphabet[bytes[i] & 31];
    if ((i + 1) % 8 === 0 && i !== bytes.length - 1) body += "-";
  }
  return "GULLAK-" + body;
}
async function makeRecoveryEnvelope(code, payload) {
  const salt = randomBytes(16), iterations = 310000, iv = randomBytes(12);
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(normalized), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload)));
  return { salt: b64(salt), iterations, encrypted_bundle: b64(iv) + "." + b64(new Uint8Array(ciphertext)) };
}
async function openRecoveryEnvelope(code, envelope) {
  const [ivText, cipherText] = envelope.encrypted_bundle.split(".");
  const salt = Buffer.from(envelope.salt, "base64");
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(normalized), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: envelope.iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(ivText, "base64") }, key, Buffer.from(cipherText, "base64"));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function wrapKidDiarySecret(password, secret) {
  const salt = randomBytes(16), iv = randomBytes(12), iterations = 310000;
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret));
  return { wrapped_secret: b64(iv) + "." + b64(new Uint8Array(ciphertext)), salt: b64(salt), iterations };
}
async function wrapSupervisorPrivateKey(password, publicKey, privateKey) {
  const privateBytes = new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", privateKey));
  const salt = randomBytes(16), iv = randomBytes(12), iterations = 310000;
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, privateBytes);
  return { public_key: publicKey, encrypted_private_key: b64(iv) + "." + b64(new Uint8Array(ciphertext)), salt: b64(salt), iterations };
}
async function unwrapKidDiarySecret(password, wrap) {
  const [ivText, cipherText] = wrap.wrapped_secret.split(".");
  const base = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(wrap.salt, "base64"), iterations: wrap.iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(ivText, "base64") }, key, Buffer.from(cipherText, "base64"));
  return new TextDecoder().decode(plain);
}
async function makeDiaryKeyShare(supervisorPublicKey, diarySecret) {
  const publicKey = await webcrypto.subtle.importKey("spki", Buffer.from(supervisorPublicKey, "base64"),
    { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublic = new Uint8Array(await webcrypto.subtle.exportKey("spki", ephemeral.publicKey));
  const salt = randomBytes(16);
  const bits = await webcrypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, ephemeral.privateKey, 256);
  const hkdf = await webcrypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt,
    info: encoder.encode("Gullak Supervisor diary-key share v1") }, hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(diarySecret)));
  return { ephemeral_public_key: b64(ephemeralPublic), salt: b64(salt), wrapped_diary_key: b64(iv) + "." + b64(ciphertext) };
}
async function openDiaryKeyShare(privateKey, share) {
  const ephemeral = await webcrypto.subtle.importKey("spki", Buffer.from(share.ephemeral_public_key, "base64"),
    { name: "ECDH", namedCurve: "P-256" }, false, []);
  const salt = Buffer.from(share.salt, "base64");
  const bits = await webcrypto.subtle.deriveBits({ name: "ECDH", public: ephemeral }, privateKey, 256);
  const hkdf = await webcrypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt,
    info: encoder.encode("Gullak Supervisor diary-key share v1") }, hkdf, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const [iv, ct] = share.wrapped_diary_key.split(".");
  const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, key, Buffer.from(ct, "base64"));
  return new TextDecoder().decode(plain);
}

const cookieFrom = response => {
  const values = response.headers.getSetCookie?.() || [];
  const value = values.find(item => item.startsWith("gullak_session=") || item.startsWith("gullak_android_session="));
  return value ? value.split(";")[0] : "";
};

async function request(path, { method = "GET", body, cookie, android = false } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (android) headers["X-Gullak-Android"] = "1";
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
  healthData.authSchema === "ready" && healthData.familySchema === "ready" && healthData.individualSchema === "ready", "Cloud Worker health/schema check failed: " + JSON.stringify(healthData));

// Exercise real account registration, cookie sessions, encrypted vault isolation,
// family creation/linking, role enforcement, member vaults, and logout.
const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const supervisorName = "smokesup_" + suffix;
const memberName = "smokekid_" + suffix;
const password = "Smoke-test-account-" + randomUUID();
const familyName = "QA Family " + suffix;
const joinCode = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000)); // Shared Family PIN

const supervisor = expect(await request("/api/family/register", {
  method: "POST", body: { username: supervisorName, password }
}), 201, "Supervisor registration");
assert(supervisor.cookie, "Registration did not issue an HttpOnly session cookie.");
assert(supervisor.response.headers.get("access-control-allow-origin") === origin,
  "Registration response is missing the expected CORS origin.");
const member = expect(await request("/api/family/register", {
  method: "POST", body: { username: memberName, password: "Member-" + password }
}), 201, "Member registration");
assert(member.cookie, "Member registration did not issue a session cookie.");
expect(await request("/api/family/login", { method: "POST", body: { username: supervisorName, password: password + "wrong" } }), 401, "First failed Family login remains unlocked");
expect(await request("/api/family/login", { method: "POST", body: { username: supervisorName, password: password + "wrong" } }), 401, "Second failed Family login remains unlocked");
expect(await request("/api/family/login", { method: "POST", body: { username: supervisorName, password: password + "wrong" } }), 401, "Third failed Family login does not apply Individual lockout");
expect(await request("/api/family/login", { method: "POST", body: { username: supervisorName, password } }), 200, "Family account still logs in after three wrong attempts");

const me = expect(await request("/api/me", { cookie: supervisor.cookie }), 200, "Family session check");
assert(me.data.authenticated && me.data.user.username === supervisorName && me.data.user.account_type === "family", "Family account identity mismatch.");
expect(await request("/api/login", { method: "POST", body: { username: supervisorName, password } }), 403, "Family credentials rejected by Individual login");
expect(await request("/api/family/login", { method: "POST", body: { username: "individual_" + suffix, password } }), 401, "Unknown Family identity rejected");

const individualName = "indivtest_" + suffix;
const individualPassword = "Individual-" + password;
const individualKey = await makeSupervisorKeyBundle(individualPassword);
const individual = expect(await request("/api/register", {
  method: "POST", body: { username: individualName, password: individualPassword, role: "supervisor", real_name: "Test Supervisor " + suffix, supervisor_key: individualKey.body }
}), 201, "Individual Supervisor registration");
assert(individual.cookie && individual.data.supervisor_code?.length === 10 && individual.data.user.role === "supervisor",
  "Supervisor registration did not issue its account session and one-time linking code.");
const individualLogin = expect(await request("/api/login", {
  method: "POST", body: { username: individualName, password: "Individual-" + password }
}), 200, "Individual Supervisor login");

assert(individualLogin.cookie.startsWith("gullak_session="), "Browser login did not receive a browser-only session cookie.");
expect(await request("/api/me", { cookie: individualLogin.cookie, android: true }), 401,
  "Browser session rejected by Android authentication");
const androidLogin = expect(await request("/api/login", {
  method: "POST", body: { username: individualName, password: "Individual-" + password }, android: true
}), 200, "Android-isolated login");
assert(androidLogin.cookie.startsWith("gullak_android_session="),
  "Android login did not receive an Android-only session cookie.");
expect(await request("/api/me", { cookie: androidLogin.cookie }), 401,
  "Android session rejected by browser authentication");
expect(await request("/api/me", { cookie: androidLogin.cookie, android: true }), 200,
  "Android session accepted by Android authentication");
assert(individualLogin.data.user.role === "supervisor" && individualLogin.data.user.status === "active",
  "Supervisor role/status was not returned after login.");
const storedSupervisorKey = expect(await request("/api/individual/supervision/keys", { cookie: individualLogin.cookie }), 200, "Supervisor encrypted key retrieval");
assert(storedSupervisorKey.data.exists && storedSupervisorKey.data.key_bundle.public_key === individualKey.body.public_key,
  "Supervisor public key bundle was not stored.");
const unlockedSupervisorPrivateKey = await unlockSupervisorKeyBundle(individualPassword, storedSupervisorKey.data.key_bundle);
const kidName = "kidtest_" + suffix;
let kidPassword = "Kid-test-" + randomUUID() + "!";
const kidRecoverySecret = b64(randomBytes(32));
const kidKeyWrap = await wrapKidDiarySecret(kidPassword, kidRecoverySecret);
const doubleEncodedSaltAttempt = await request("/api/register", {
  method: "POST", body: { username: "kidbad_" + suffix, password: kidPassword, role: "kid", real_name: "Invalid Kid " + suffix,
    supervisor_codes: [individual.data.supervisor_code], supervisor_relationships: ["Mum"], key_wrap: { ...kidKeyWrap, salt: b64(randomBytes(0)) } }
});
assert(doubleEncodedSaltAttempt.response.status === 400 && /encryption key/i.test(doubleEncodedSaltAttempt.data.error || ""),
  "Kid registration unexpectedly accepted a zero-length encryption salt.");
const kidRegistration = expect(await request("/api/register", {
  method: "POST", body: { username: kidName, password: kidPassword, role: "kid", real_name: "Test Kid " + suffix, supervisor_codes: [individual.data.supervisor_code], supervisor_relationships: ["Mum"], key_wrap: kidKeyWrap }
}), 201, "Pending Kid registration");
assert(kidRegistration.data.pending_approval && kidRegistration.cookie && kidRegistration.data.user.status === "pending",
  "A Kid account became active before Supervisor approval.");
const pendingKidLogin = expect(await request("/api/login", { method: "POST", body: { username: kidName, password: kidPassword } }), 200, "Pending Kid can sign in to manage Supervisor requests");
assert(pendingKidLogin.data.user.status === "pending", "Pending Kid session was incorrectly activated.");
expect(await request("/api/vault", { cookie: pendingKidLogin.cookie }), 403, "Pending Kid cannot open a diary before approval");
const pendingKidLinks = expect(await request("/api/individual/supervision", { cookie: pendingKidLogin.cookie }), 200, "Pending Kid can view Supervisor request status");
assert(pendingKidLinks.data.status === "pending", "Pending Kid supervision state was not returned.");
assert(pendingKidLinks.data.links[0]?.other_real_name == null, "Kid was shown a Supervisor real name before acceptance.");
const firstSupervisorRequests = expect(await request("/api/individual/supervision", { cookie: individualLogin.cookie }), 200, "Supervisor request list");
const firstRequest = firstSupervisorRequests.data.links.find(row => row.other_username === kidName && row.status === "pending");
assert(firstRequest, "Supervisor did not receive the Kid's pending request.");
assert(firstRequest.other_real_name === "Test Kid " + suffix, "Supervisor request did not include the Kid real name.");
assert(firstRequest.relationship === "Mum", "Supervisor request did not include the Kid-selected relationship.");
expect(await request("/api/individual/supervision/requests/" + firstRequest.link_id, {
  method: "POST", cookie: individualLogin.cookie, body: { decision: "accept", rules: {
    loanInterest: 5, matchPct: 10, coolHours: 24, coolMin: 200, reviewHours: 12
  } }
}), 200, "Supervisor accepts Kid with first-approval Grown-up Rules");
let kidLogin = expect(await request("/api/login", {
  method: "POST", body: { username: kidName, password: kidPassword }
}), 200, "Kid login after approval");
assert(kidLogin.data.user.role === "kid" && kidLogin.data.user.status === "active",
  "Kid account did not activate after Supervisor approval.");

// Kid recovery restores the same diary secret and re-wraps it under the new account password.
const kidRecoveryCode = makeRecoveryCode();
const kidRecoveryEnvelope = await makeRecoveryEnvelope(kidRecoveryCode, { version: 1, role: "kid", diary_secret: kidRecoverySecret });
expect(await request("/api/individual/recovery", { method: "PUT", cookie: kidLogin.cookie, body: { code: kidRecoveryCode, ...kidRecoveryEnvelope } }), 200, "Save Kid recovery code");
const kidRecoveryPrepared = expect(await request("/api/individual/recovery/prepare", { method: "POST", body: { username: kidName, code: kidRecoveryCode } }), 200, "Verify Kid recovery code");
const recoveredKidPayload = await openRecoveryEnvelope(kidRecoveryCode, kidRecoveryPrepared.data);
assert(recoveredKidPayload.diary_secret === kidRecoverySecret, "Kid recovery code did not decrypt the original diary key.");
const newKidPassword = "Recovered-Kid-" + randomUUID() + "!";
const newKidWrap = await wrapKidDiarySecret(newKidPassword, recoveredKidPayload.diary_secret);
expect(await request("/api/individual/recovery/complete", { method: "POST", body: {
  username: kidName, code: kidRecoveryCode, new_password: newKidPassword, key_wrap: newKidWrap
} }), 200, "Complete Kid account recovery");
expect(await request("/api/login", { method: "POST", body: { username: kidName, password: kidPassword } }), 401, "Old Kid password rejected after recovery");
kidPassword = newKidPassword;
kidLogin = expect(await request("/api/login", { method: "POST", body: { username: kidName, password: kidPassword } }), 200, "Kid login with recovered password");
const kidWrapAfterRecovery = expect(await request("/api/key-wrap", { cookie: kidLogin.cookie }), 200, "Recovered Kid password-wrapped diary key");
assert(await unwrapKidDiarySecret(kidPassword, kidWrapAfterRecovery.data.key_wrap) === kidRecoverySecret, "Kid's original diary key was not preserved by recovery.");
const kidLinks = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid's Supervisor list");
assert(kidLinks.data.links.some(row => row.other_username === individualName && row.status === "accepted"),
  "Kid does not see the accepted Supervisor relationship.");
assert(kidLinks.data.links.find(row => row.other_username === individualName)?.relationship === "Mum", "Kid did not receive the registration relationship.");
const firstSupervisorLink = kidLinks.data.links.find(row => row.other_username === individualName);
expect(await request("/api/individual/supervision/relationships/" + firstSupervisorLink.link_id, { method: "PUT", cookie: kidLogin.cookie, body: { relationship: "Mother" } }), 200, "Kid changes Supervisor relationship");
const changedLinks = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid reads changed relationship");
assert(changedLinks.data.links.find(row => row.other_username === individualName)?.relationship === "Mother", "Kid relationship change did not persist.");
assert(kidLinks.data.links.find(row => row.other_username === individualName)?.other_real_name === "Test Supervisor " + suffix,
  "Kid did not see the Supervisor real name after acceptance.");
assert(kidLinks.data.rules && kidLinks.data.rules.loanInterest === 5 && kidLinks.data.rules.matchPct === 10 &&
  kidLinks.data.rules.coolHours === 24 && kidLinks.data.rules.coolMin === 200 && kidLinks.data.rules.reviewHours === 12,
  "Kid did not receive the Grown-up Rules saved during first approval.");
const acceptedFirstLink = kidLinks.data.links.find(row => row.other_username === individualName && row.status === "accepted");
assert(acceptedFirstLink.supervisor_public_key, "Kid cannot retrieve the accepted Supervisor's public key.");
const testDiarySecret = kidRecoverySecret;
const firstKeyShare = await makeDiaryKeyShare(acceptedFirstLink.supervisor_public_key, testDiarySecret);
expect(await request("/api/individual/supervision/key-shares", { method: "PUT", cookie: kidLogin.cookie,
  body: { supervisor_user_id: acceptedFirstLink.other_user_id, ...firstKeyShare } }), 200, "Kid shares diary key end-to-end");
const firstSupervisorVaultBeforeDiary = expect(await request("/api/individual/supervision/kids/" + kidLogin.data.user.user_id + "/vault", { cookie: individualLogin.cookie }), 200, "Supervisor can access linked Kid vault");
assert(!firstSupervisorVaultBeforeDiary.data.exists && firstSupervisorVaultBeforeDiary.data.key_share, "Supervisor key share was not returned for an empty Kid diary.");
assert(await openDiaryKeyShare(unlockedSupervisorPrivateKey, firstSupervisorVaultBeforeDiary.data.key_share) === testDiarySecret,
  "Supervisor could not decrypt the Kid's end-to-end encrypted diary key.");

const secondSupervisorName = "indivsup2_" + suffix;
let secondSupervisorPassword = "Second-Supervisor-" + randomUUID() + "!";
const secondSupervisorKey = await makeSupervisorKeyBundle(secondSupervisorPassword);
const secondSupervisor = expect(await request("/api/register", {
  method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword, role: "supervisor", real_name: "Second Supervisor " + suffix, supervisor_key: secondSupervisorKey.body }
}), 201, "Second Individual Supervisor registration");
let secondSupervisorLogin = expect(await request("/api/login", {
  method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword }
}), 200, "Second Supervisor login");

// Supervisor recovery-code rotation invalidates the previous code immediately.
const secondPrivateBytes = b64(new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", secondSupervisorKey.privateKey)));
const oldRecoveryCode = makeRecoveryCode();
const oldRecoveryEnvelope = await makeRecoveryEnvelope(oldRecoveryCode, {
  version: 1, role: "supervisor", public_key: secondSupervisorKey.body.public_key, private_key: secondPrivateBytes
});
expect(await request("/api/individual/recovery", { method: "PUT", cookie: secondSupervisorLogin.cookie, body: { code: oldRecoveryCode, ...oldRecoveryEnvelope } }), 200, "Save Supervisor recovery code");
const replacementRecoveryCode = makeRecoveryCode();
const replacementRecoveryEnvelope = await makeRecoveryEnvelope(replacementRecoveryCode, {
  version: 1, role: "supervisor", public_key: secondSupervisorKey.body.public_key, private_key: secondPrivateBytes
});
expect(await request("/api/individual/recovery", { method: "PUT", cookie: secondSupervisorLogin.cookie, body: { code: replacementRecoveryCode, ...replacementRecoveryEnvelope } }), 200, "Replace Supervisor recovery code");
expect(await request("/api/individual/recovery/prepare", { method: "POST", body: { username: secondSupervisorName, code: oldRecoveryCode } }), 401, "Old Supervisor recovery code invalidated");
const supervisorRecoveryPrepared = expect(await request("/api/individual/recovery/prepare", { method: "POST", body: { username: secondSupervisorName, code: replacementRecoveryCode } }), 200, "Verify replacement Supervisor recovery code");
const recoveredSupervisorPayload = await openRecoveryEnvelope(replacementRecoveryCode, supervisorRecoveryPrepared.data);
assert(recoveredSupervisorPayload.public_key === secondSupervisorKey.body.public_key && recoveredSupervisorPayload.private_key === secondPrivateBytes,
  "Supervisor recovery code did not preserve the original ECDH key pair.");
const androidPinBeforeRecovery = expect(await request("/api/login", {
  method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword }, android: true
}), 200, "Android session before account recovery");
expect(await request("/api/mobile-pin/setup", { method: "POST", cookie: androidPinBeforeRecovery.cookie, android: true, body: { pin: "123456" } }), 200, "Set existing Android PIN before recovery");
// Three incorrect account passwords lock the Individual account for the one-minute test window.
expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword + "wrong" } }), 401, "First failed Individual login");
expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword + "wrong" } }), 401, "Second failed Individual login");
expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword + "wrong" } }), 429, "Third failed Individual login locks account");
expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword } }), 429, "Correct password blocked during temporary account lock");
const newSecondSupervisorPassword = "Recovered-Supervisor-" + randomUUID() + "!";
const recoveredSupervisorKey = await wrapSupervisorPrivateKey(newSecondSupervisorPassword, recoveredSupervisorPayload.public_key,
  await webcrypto.subtle.importKey("pkcs8", Buffer.from(recoveredSupervisorPayload.private_key, "base64"), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]));
expect(await request("/api/individual/recovery/complete", { method: "POST", body: {
  username: secondSupervisorName, code: replacementRecoveryCode, new_password: newSecondSupervisorPassword, supervisor_key: recoveredSupervisorKey
} }), 200, "Complete Supervisor recovery while account is locked");
expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword } }), 401, "Old Supervisor password rejected after recovery");
secondSupervisorPassword = newSecondSupervisorPassword;
secondSupervisorLogin = expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword } }), 200, "Supervisor login with recovered password");
const androidPinSession = expect(await request("/api/login", { method: "POST", body: { username: secondSupervisorName, password: secondSupervisorPassword }, android: true }), 200, "Android session for PIN lockout");
const pinStatusAfterRecovery = expect(await request("/api/mobile-pin/status", { cookie: androidPinSession.cookie, android: true }), 200, "Android PIN status after account recovery");
assert(pinStatusAfterRecovery.data.configured === false, "Account recovery did not clear the old Android PIN.");
expect(await request("/api/mobile-pin/setup", { method: "POST", cookie: androidPinSession.cookie, android: true, body: { pin: "654321" } }), 200, "Create replacement Android PIN without setup lockout");
expect(await request("/api/mobile-pin/verify", { method: "POST", cookie: androidPinSession.cookie, android: true, body: { pin: "000000" } }), 403, "First wrong Android PIN");
expect(await request("/api/mobile-pin/verify", { method: "POST", cookie: androidPinSession.cookie, android: true, body: { pin: "000000" } }), 403, "Second wrong Android PIN");
expect(await request("/api/mobile-pin/verify", { method: "POST", cookie: androidPinSession.cookie, android: true, body: { pin: "000000" } }), 429, "Third wrong Android PIN locks entry");
expect(await request("/api/mobile-pin/verify", { method: "POST", cookie: androidPinSession.cookie, android: true, body: { pin: "654321" } }), 429, "Correct Android PIN blocked during temporary lock");
const secondStoredKey = expect(await request("/api/individual/supervision/keys", { cookie: secondSupervisorLogin.cookie }), 200, "Second Supervisor encrypted key retrieval");
assert(secondStoredKey.data.key_bundle.public_key === secondSupervisorKey.body.public_key, "Supervisor recovery changed the public key and broke existing diary shares.");
const unlockedSecondSupervisorKey = await unlockSupervisorKeyBundle(secondSupervisorPassword, secondStoredKey.data.key_bundle);
expect(await request("/api/individual/supervision/requests", {
  method: "POST", cookie: kidLogin.cookie, body: { code: secondSupervisor.data.supervisor_code }
}), 201, "Kid requests an additional Supervisor without setting its relationship during registration");
const pendingSecondLinkData = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid pending second Supervisor link");
const pendingSecondLink = pendingSecondLinkData.data.links.find(row => row.other_username === secondSupervisorName);
assert(pendingSecondLink?.supervisor_public_key, "Kid cannot retrieve the second Supervisor public key.");
assert(!String(pendingSecondLink.relationship || "").trim(), "An additional Supervisor relationship should remain unset until the Kid sets it on the supervision page.");
expect(await request("/api/individual/supervision/relationships/" + pendingSecondLink.link_id, {
  method: "PUT", cookie: kidLogin.cookie, body: { relationship: "Aunt" }
}), 200, "Kid sets an additional Supervisor relationship while the request is pending");
const pendingRelationshipUpdate = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid reads the newly set pending relationship");
assert(pendingRelationshipUpdate.data.links.find(row => row.other_username === secondSupervisorName)?.relationship === "Aunt",
  "Kid's pending Supervisor relationship did not persist.");
assert(pendingSecondLink.other_real_name == null, "Kid saw the second Supervisor real name before acceptance.");
const unacceptedShare = await makeDiaryKeyShare(pendingSecondLink.supervisor_public_key, testDiarySecret);
expect(await request("/api/individual/supervision/key-shares", { method: "PUT", cookie: kidLogin.cookie,
  body: { supervisor_user_id: pendingSecondLink.other_user_id, ...unacceptedShare } }), 403, "Kid cannot share diary key before Supervisor acceptance");
expect(await request("/api/individual/supervision/kids/" + kidLogin.data.user.user_id + "/vault", { cookie: secondSupervisorLogin.cookie }), 403, "Unaccepted Supervisor cannot read Kid diary");
const secondRequests = expect(await request("/api/individual/supervision", { cookie: secondSupervisorLogin.cookie }), 200, "Second Supervisor request list");
const secondRequest = secondRequests.data.links.find(row => row.other_username === kidName && row.status === "pending");
assert(secondRequest, "Second Supervisor did not receive the additional request.");
expect(await request("/api/individual/supervision/requests/" + secondRequest.link_id, {
  method: "POST", cookie: secondSupervisorLogin.cookie, body: { decision: "accept" }
}), 200, "Second Supervisor accepts Kid");
const twoSupervisors = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid's multiple Supervisor list");
assert(twoSupervisors.data.links.filter(row => row.status === "accepted").length === 2,
  "Kid cannot have multiple accepted Supervisors.");
const secondAcceptedLink = twoSupervisors.data.links.find(row => row.other_username === secondSupervisorName && row.status === "accepted");
assert(secondAcceptedLink?.supervisor_public_key, "Second Supervisor public key was not shared with the Kid.");
assert(secondAcceptedLink.other_real_name === "Second Supervisor " + suffix, "Kid did not see the second Supervisor real name after acceptance.");
assert(secondAcceptedLink.relationship === "Aunt", "The relationship set on the Kid supervision page was lost when the Supervisor accepted.");
const secondKeyShare = await makeDiaryKeyShare(secondAcceptedLink.supervisor_public_key, testDiarySecret);
expect(await request("/api/individual/supervision/key-shares", { method: "PUT", cookie: kidLogin.cookie,
  body: { supervisor_user_id: secondAcceptedLink.other_user_id, ...secondKeyShare } }), 200, "Kid shares diary key with second Supervisor");
const secondVaultAccess = expect(await request("/api/individual/supervision/kids/" + kidLogin.data.user.user_id + "/vault", { cookie: secondSupervisorLogin.cookie }), 200, "Second Supervisor can access linked Kid vault");
assert(await openDiaryKeyShare(unlockedSecondSupervisorKey, secondVaultAccess.data.key_share) === testDiarySecret,
  "Second Supervisor could not decrypt the shared diary key.");
expect(await request("/api/individual/supervision", { cookie: supervisor.cookie }), 403, "Family account blocked from Individual supervision APIs");

const beforeDiarySupervision = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid supervision status before diary creation");
assert(beforeDiarySupervision.data.has_diary === false, "Kid should not be marked as having a diary before the first vault save.");
const privateVault = encrypted();
expect(await request("/api/vault", { method: "PUT", cookie: kidLogin.cookie, body: privateVault }), 200, "Encrypted Individual vault save");
const afterDiarySupervision = expect(await request("/api/individual/supervision", { cookie: kidLogin.cookie }), 200, "Kid supervision status after diary creation");
assert(afterDiarySupervision.data.has_diary === true, "Kid diary creation status was not reflected in supervision data.");
const ownVault = expect(await request("/api/vault", { cookie: kidLogin.cookie }), 200, "Encrypted Individual vault read");
assert(ownVault.data.exists && ownVault.data.vault.ciphertext === privateVault.ciphertext,
  "Encrypted Individual vault read did not return the saved ciphertext.");
const supervisorUpdatedVault = encrypted();
expect(await request("/api/individual/supervision/kids/" + kidLogin.data.user.user_id + "/vault", {
  method: "PUT", cookie: individualLogin.cookie, body: supervisorUpdatedVault
}), 200, "Supervisor saves an approved Kid diary update");
const kidSeesSupervisorUpdate = expect(await request("/api/vault", { cookie: kidLogin.cookie }), 200, "Kid sees Supervisor's cloud-synced update");
assert(kidSeesSupervisorUpdate.data.vault.ciphertext === supervisorUpdatedVault.ciphertext,
  "Supervisor diary changes did not sync back to the Kid account.");
expect(await request("/api/vault", { cookie: individualLogin.cookie }), 403, "Supervisor accounts cannot open Kid diaries");
const supervisorKeyWrap = expect(await request("/api/key-wrap", { cookie: individualLogin.cookie }), 200, "Supervisor key-wrapper check");
assert(!supervisorKeyWrap.data.exists, "Supervisor account unexpectedly received a Kid diary key.");
expect(await request("/api/family/login", { method: "POST", body: { username: individualName, password: "Individual-" + password } }), 403, "Individual credentials rejected by Family login");
expect(await request("/api/vault", { cookie: supervisor.cookie }), 403, "Family account blocked from Individual vault");

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
expect(await request("/api/families/" + encodeURIComponent(familyId) + "/members", {
  method: "POST", cookie: supervisor.cookie,
  body: { username: individualName, role: "member" }
}), 409, "Individual account cannot be linked into Family mode");

const directoryBeforeLogin = expect(await request("/api/families"), 200, "Family directory before login");
assert(directoryBeforeLogin.data.families.some(item => item.family_id === familyId), "Family missing from cloud directory.");
const pinGate = expect(await request("/api/families/" + familyId + "/vault"), 200, "Shared PIN vault retrieval");
assert(pinGate.data.exists && pinGate.data.family_key_wrap, "Shared PIN wrapper was not returned.");

const nameSearch = expect(await request("/api/families/search?q=" + encodeURIComponent(familyName)),
  200, "Public family-name search");
assert(nameSearch.data.families.some(item => item.family_id === familyId),
  "Family name did not find the family.");
expect(await request("/api/families/" + encodeURIComponent(familyId) + "/join", {
  method: "POST", cookie: member.cookie, body: { join_code: joinCode }
}), 403, "Family PIN cannot self-join an account");

const linked = expect(await request("/api/families/" + encodeURIComponent(familyId) + "/members", {
  method: "POST", cookie: supervisor.cookie,
  body: { username: memberName, role: "member" }
}), 200, "Supervisor links an existing member account");
assert(linked.data.member.user_id === member.data.user.user_id, "Family linked the wrong account.");

const createdKidName = "createdkid_" + suffix;
const createdKidPassword = "Created-Member-" + randomUUID() + "!";
const createdKidKeySalt = b64(randomBytes(16));
const createdKidKeyWrap = b64(randomBytes(12)) + "." + b64(randomBytes(48));
const createdKid = expect(await request("/api/families/" + familyId + "/members", {
  method: "POST", cookie: supervisor.cookie,
  body: {
    username: createdKidName, password: createdKidPassword, role: "member",
    wrapped_secret: createdKidKeyWrap, salt: createdKidKeySalt, iterations: 310000
  }
}), 200, "Supervisor creates a new Gullak account");
assert(createdKid.data.member.username === createdKidName && createdKid.data.member.user_id,
  "Supervisor-created account was not linked to the family.");
const createdKidLogin = expect(await request("/api/family/login", {
  method: "POST", body: { username: createdKidName, password: createdKidPassword }
}), 200, "Supervisor-created member login");
assert(createdKidLogin.data.user.user_id === createdKid.data.member.user_id,
  "Supervisor-created member could not authenticate with its own Family credentials.");
expect(await request("/api/login", { method: "POST", body: { username: createdKidName, password: createdKidPassword } }), 403, "Family Kid credentials rejected by Individual login");
expect(await request("/api/vault", { cookie: createdKidLogin.cookie }), 403, "Family Kid blocked from Individual vault");
const createdKidKey = expect(await request("/api/key-wrap", { cookie: createdKidLogin.cookie }),
  200, "Supervisor-created member encryption-key wrapper");
assert(createdKidKey.data.exists, "Supervisor-created member has no password-wrapped encryption key.");
const allFamilies = expect(await request("/api/families", { cookie: createdKidLogin.cookie }),
  200, "Cloud-wide family directory");
assert(allFamilies.data.families.some(item => item.family_id === familyId),
  "Family directory did not list the created member's family.");

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

// Wrong-password deletion must be rejected without changing the account.
expect(await request("/api/account", { method: "DELETE", cookie: supervisor.cookie, body: { password: "not-the-password" } }), 403, "Wrong-password account deletion");
expect(await request("/api/me", { cookie: supervisor.cookie }), 200, "Account remains after wrong deletion password");

// Deleting the family creator transfers ownership and supervisor role to the remaining member.
expect(await request("/api/account", { method: "DELETE", cookie: supervisor.cookie, body: { password } }), 200, "Confirmed account deletion");
expect(await request("/api/me", { cookie: supervisor.cookie }), 401, "Deleted account session denial");
const transferred = expect(await request("/api/families/" + familyId + "/members", { cookie: member.cookie }), 200, "Family survives creator deletion");
assert(transferred.data.members.some(item => item.username === memberName && item.role === "supervisor"),
  "Family ownership/supervisor role was not transferred to the remaining member.");
// Clean up every account and the family created by this live test.
expect(await request("/api/account", { method: "DELETE", cookie: createdKidLogin.cookie, body: { password: createdKidPassword } }), 200, "Delete test-created kid account");
expect(await request("/api/account", { method: "DELETE", cookie: secondSupervisorLogin.cookie, body: { password: secondSupervisorPassword } }), 200, "Delete second test Supervisor account");
const kidAfterOneSupervisor = expect(await request("/api/me", { cookie: kidLogin.cookie }), 200, "Kid remains active with one accepted Supervisor");
assert(kidAfterOneSupervisor.data.user.status === "active", "Kid was locked while another accepted Supervisor remained.");
expect(await request("/api/account", { method: "DELETE", cookie: individualLogin.cookie, body: { password: "Individual-" + password } }), 200, "Delete last test Individual Supervisor account");
expect(await request("/api/me", { cookie: kidLogin.cookie }), 401, "Last Supervisor deletion revokes the Kid's active session");
const kidPendingAgain = expect(await request("/api/login", { method: "POST", body: { username: kidName, password: kidPassword } }), 200, "Kid can sign in to see pending Supervisor status");
assert(kidPendingAgain.data.user.status === "pending", "Kid stayed active after losing every accepted Supervisor.");
expect(await request("/api/vault", { cookie: kidPendingAgain.cookie }), 403, "Kid diary relocked after last Supervisor deletion");
expect(await request("/api/account", { method: "DELETE", cookie: kidPendingAgain.cookie, body: { password: kidPassword } }), 200, "Delete test Kid account and Supervisor links");
expect(await request("/api/account", { method: "DELETE", cookie: member.cookie, body: { password: "Member-" + password } }), 200, "Delete test member and empty test family");
expect(await request("/api/me", { cookie: member.cookie }), 401, "Deleted test member session denial");

// Mutating requests without an Origin must be rejected (CSRF hardening).
const noOrigin = await fetch(apiUrl + "/api/logout", {
  method: "POST", headers: { Cookie: supervisor.cookie }, cache: "no-store"
});
assert(noOrigin.status === 403, "Mutation without an Origin header was not rejected.");

console.log("Live deployment integration tests passed.");
console.log("Frontend:", appUrl);
console.log("Cloud API:", apiUrl);
console.log("Family schema:", healthData.familySchema);
console.log("Verified: Individual Supervisor/Kid registration, pending approval, multiple Supervisors, encrypted vault isolation, separate Family registration/login, family directory/linking, Family role permissions, member vaults, logout, and Origin enforcement.");
