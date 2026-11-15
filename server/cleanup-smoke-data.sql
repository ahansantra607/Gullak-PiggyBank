-- Remove only test fixtures created by Gullak's live smoke/API tests.
-- Family rows are deleted first because created_by is intentionally RESTRICTed.
DELETE FROM cloud_families
WHERE name LIKE 'Smoke Family %'
   OR name LIKE 'QA Family %'
   OR created_by IN (
     SELECT user_id FROM users
     WHERE substr(username, 1, 9) IN ('smokesup_', 'smokekid_', 'vault_test_')
        OR username LIKE 'Smoke-test-account-%'
        OR username LIKE 'indivtest_%'
        OR username LIKE 'indivsup2_%'
        OR username LIKE 'kidtest_%'
        OR username LIKE 'createdkid_%'
   );

-- Cascades remove each test account's sessions, key wraps, vaults and memberships.
DELETE FROM users
WHERE substr(username, 1, 9) IN ('smokesup_', 'smokekid_', 'vault_test_')
   OR username LIKE 'Smoke-test-account-%'
   OR username LIKE 'indivtest_%'
   OR username LIKE 'indivsup2_%'
   OR username LIKE 'kidtest_%'
   OR username LIKE 'createdkid_%';

-- Return remaining fixture counts; both values must be zero.
SELECT
  (SELECT COUNT(*) FROM cloud_families
   WHERE name LIKE 'Smoke Family %' OR name LIKE 'QA Family %') AS remaining_test_families,
  (SELECT COUNT(*) FROM users
   WHERE substr(username, 1, 9) IN ('smokesup_', 'smokekid_', 'vault_test_')
      OR username LIKE 'Smoke-test-account-%'
      OR username LIKE 'indivtest_%'
      OR username LIKE 'indivsup2_%'
      OR username LIKE 'kidtest_%'
      OR username LIKE 'createdkid_%') AS remaining_test_accounts;
