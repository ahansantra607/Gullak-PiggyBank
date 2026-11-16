-- ONE-TIME, USER-CONFIRMED FULL ACCOUNT RESET.
-- Keep all tables/schema; delete every cloud account and all dependent data.
-- Family parent rows must be removed first because created_by uses ON DELETE RESTRICT.
SELECT
  (SELECT COUNT(*) FROM users) AS accounts_before,
  (SELECT COUNT(*) FROM cloud_families) AS families_before,
  (SELECT COUNT(*) FROM sessions) AS sessions_before;

DELETE FROM cloud_families;
DELETE FROM users;

-- Verification: every account and account-owned data table must be empty.
SELECT
  (SELECT COUNT(*) FROM users) AS accounts_remaining,
  (SELECT COUNT(*) FROM sessions) AS sessions_remaining,
  (SELECT COUNT(*) FROM user_account_types) AS account_types_remaining,
  (SELECT COUNT(*) FROM user_key_wraps) AS key_wraps_remaining,
  (SELECT COUNT(*) FROM user_vaults) AS individual_diaries_remaining,
  (SELECT COUNT(*) FROM user_mobile_pins) AS mobile_pins_remaining,
  (SELECT COUNT(*) FROM cloud_families) AS families_remaining,
  (SELECT COUNT(*) FROM cloud_family_members) AS family_members_remaining,
  (SELECT COUNT(*) FROM cloud_family_vaults) AS family_vaults_remaining,
  (SELECT COUNT(*) FROM cloud_family_member_vaults) AS family_member_vaults_remaining,
  (SELECT COUNT(*) FROM individual_account_roles) AS individual_roles_remaining,
  (SELECT COUNT(*) FROM individual_supervisor_codes) AS supervisor_codes_remaining,
  (SELECT COUNT(*) FROM individual_supervisor_links) AS supervisor_links_remaining,
  (SELECT COUNT(*) FROM individual_supervisor_keys) AS supervisor_keys_remaining,
  (SELECT COUNT(*) FROM individual_kid_key_shares) AS kid_key_shares_remaining,
  (SELECT COUNT(*) FROM individual_kid_rules) AS kid_rules_remaining;
