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
WHERE user_id IN (SELECT user_id FROM user_account_types WHERE account_type = 'individual')
  AND NOT EXISTS (SELECT 1 FROM individual_account_roles r WHERE r.user_id = users.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = users.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = users.user_id);
