-- Cloud family directory and encrypted family/member vaults.
-- Family names are searchable metadata; all private family details remain encrypted.
CREATE TABLE IF NOT EXISTS cloud_families (
  family_id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  join_code_hash TEXT NOT NULL UNIQUE,
  family_key_wrap TEXT NOT NULL,
  key_wrap_salt TEXT NOT NULL,
  key_wrap_iterations INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_families_name
ON cloud_families(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS cloud_family_members (
  family_id TEXT NOT NULL REFERENCES cloud_families(family_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('supervisor', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_family_members_user
ON cloud_family_members(user_id);

CREATE TABLE IF NOT EXISTS cloud_family_vaults (
  family_id TEXT PRIMARY KEY REFERENCES cloud_families(family_id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_family_member_vaults (
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (family_id, user_id),
  FOREIGN KEY (family_id, user_id)
    REFERENCES cloud_family_members(family_id, user_id) ON DELETE CASCADE
);
