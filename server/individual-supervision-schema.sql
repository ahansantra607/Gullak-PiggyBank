-- Individual Supervisor/Kid relationships. Family accounts and tables are intentionally separate.
CREATE TABLE IF NOT EXISTS individual_account_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('supervisor', 'kid')),
  status TEXT NOT NULL CHECK (status IN ('active', 'pending')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS individual_supervisor_codes (
  code_hash TEXT PRIMARY KEY,
  supervisor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_individual_active_supervisor_code
ON individual_supervisor_codes(supervisor_user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS individual_supervisor_links (
  link_id TEXT PRIMARY KEY,
  kid_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  supervisor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE(kid_user_id, supervisor_user_id),
  CHECK (kid_user_id <> supervisor_user_id)
);
CREATE INDEX IF NOT EXISTS idx_individual_links_supervisor
ON individual_supervisor_links(supervisor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_individual_links_kid
ON individual_supervisor_links(kid_user_id, status);

-- One-time-compatible cleanup: only legacy Individual users with no new role row
-- are deleted. New Individual accounts created after this migration have a role
-- row and survive every later deployment. Family identities and creators are protected.
DELETE FROM users
WHERE COALESCE((SELECT account_type FROM user_account_types t WHERE t.user_id = users.user_id), 'individual') = 'individual'
  AND NOT EXISTS (SELECT 1 FROM individual_account_roles r WHERE r.user_id = users.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = users.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = users.user_id);


-- Real names are private Individual profile details. Supervisors see a Kid's name on requests; Kids see a Supervisor's name only after acceptance.
CREATE TABLE IF NOT EXISTS individual_real_names (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  real_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Supervisor public keys and client-side encrypted private keys.
CREATE TABLE IF NOT EXISTS individual_supervisor_keys (
  supervisor_user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Each Kid encrypts their diary key separately for each accepted Supervisor.
CREATE TABLE IF NOT EXISTS individual_kid_key_shares (
  kid_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  supervisor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ephemeral_public_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  wrapped_diary_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kid_user_id, supervisor_user_id)
);


-- House rules selected by the first Supervisor who approves an Individual Kid.
CREATE TABLE IF NOT EXISTS individual_kid_rules (
  kid_user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  rules_json TEXT NOT NULL,
  set_by_supervisor_user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);


-- Keep the selected rules if the Supervisor who first set them later deletes
-- their account. The attribution is historical metadata, not a live dependency.
CREATE TABLE IF NOT EXISTS individual_kid_rules_v2 (
  kid_user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  rules_json TEXT NOT NULL,
  set_by_supervisor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO individual_kid_rules_v2
  (kid_user_id, rules_json, set_by_supervisor_user_id, created_at, updated_at)
SELECT kid_user_id, rules_json, set_by_supervisor_user_id, created_at, updated_at
FROM individual_kid_rules;
DROP TABLE individual_kid_rules;
ALTER TABLE individual_kid_rules_v2 RENAME TO individual_kid_rules;
