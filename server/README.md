# Gullak Cloud Worker

## Apply the cloud-family database schema

The existing `users`, `sessions`, and `user_vaults` tables remain unchanged. Apply the additional family tables once:

```bash
cd server
npx wrangler d1 execute gullak-db --remote --file=family-schema.sql
```

Then check:

```bash
curl https://server.ahansantra607.workers.dev/api/health
```

The health response should include `"familySchema":"ready"`. If it says `"migration_required"`, the family schema has not been applied to the remote D1 database yet.

## Deploy the Worker

```bash
cd server
npx wrangler deploy
```

The GitHub repository does not contain Cloudflare deployment credentials, so pushing to `main` does not deploy the Worker automatically.

## Data and encryption model

- Account passwords are verified by the Worker; browser encryption passphrases are never sent to it.
- Individual vaults are encrypted in the browser with AES-GCM before upload.
- Family names are searchable directory metadata. Family details and financial records are encrypted in the browser.
- Family invite/recovery codes wrap the family key. Keep the code private.
- Supervisors manage membership and shared family metadata. Members can write only their own member vault; supervisors can read and sync member vaults.
- The family schema adds `cloud_families`, `cloud_family_members`, `cloud_family_vaults`, and `cloud_family_member_vaults`.

## Before removing old browser storage

Do not clear existing browser data until each individual diary and family has been migrated, decrypted again from the server, and exported to an encrypted backup. The current transition code deliberately retains the existing local copy.