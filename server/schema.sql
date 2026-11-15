CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_account_types (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN ('individual', 'family')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id)
        ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_key_wraps (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    wrapped_secret TEXT NOT NULL,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_vaults (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    salt TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS user_mobile_pins (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
