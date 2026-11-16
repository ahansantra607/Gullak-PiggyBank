-- One-time reset: remove Individual accounts only.
-- Family accounts, family members, family creators and all Family data are protected.
PRAGMA foreign_keys = ON;

SELECT 'individual_accounts_before' AS metric, COUNT(*) AS total
FROM users u
WHERE COALESCE((SELECT account_type FROM user_account_types t WHERE t.user_id = u.user_id), 'individual') = 'individual'
  AND NOT EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = u.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = u.user_id);

DELETE FROM users
WHERE COALESCE((SELECT account_type FROM user_account_types t WHERE t.user_id = users.user_id), 'individual') = 'individual'
  AND NOT EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = users.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = users.user_id);

SELECT 'individual_accounts_remaining' AS metric, COUNT(*) AS total
FROM users u
WHERE COALESCE((SELECT account_type FROM user_account_types t WHERE t.user_id = u.user_id), 'individual') = 'individual'
  AND NOT EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = u.user_id)
  AND NOT EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = u.user_id);

SELECT 'family_accounts_preserved' AS metric, COUNT(*) AS total
FROM users u
WHERE EXISTS (SELECT 1 FROM cloud_family_members fm WHERE fm.user_id = u.user_id)
   OR EXISTS (SELECT 1 FROM cloud_families f WHERE f.created_by = u.user_id);
