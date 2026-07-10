# Carrier Onboarding & Verification — Design

## Goal

Pre-load carriers (sourced from the FMC NVOCC registry) into the directory as **masked "pending" listings**. Each carrier becomes a **verified, fully visible listing** once they confirm their details, through any of three paths. All of it is managed by an **admin role**.

## Current state (for reference)

- Carriers today are just `users` rows with `user_type = 'company'`.
- The directory endpoint `/api/companies` lists those users by `name` + `company_name`.
- There is no pending/verified status, no admin role, no email, and no pre-loaded carrier concept.
- Backend is pure-stdlib Python (`http.server` + `sqlite3`); `init_db()` only runs when the DB file is absent, so schema changes need an explicit idempotent migration.

## Data model changes

New `carriers` table — the source of truth for the directory:

| column | purpose |
|---|---|
| id | PK |
| company_name | legal carrier name |
| contact_name | named contact |
| email | FMC-listed / primary email (used for claim link + self-signup match) |
| phone | contact phone |
| country / address | location |
| lanes | e.g. "Asia–US West Coast" (shown even while masked) |
| fmc_id | NVOCC registry reference |
| status | `pending` or `verified` |
| claim_token | unique token for the emailed claim link |
| user_id | FK to `users`, set when the carrier claims an account |
| created_at, verified_at | timestamps |

`users` table — add `is_admin INTEGER DEFAULT 0`.

## States

`pending` (imported, masked) → `verified` (claimed/approved, full listing). Keep it to two states for now; a `contacted` interim state can be added later if useful.

## Directory behavior (`/api/companies`)

Reads from `carriers` instead of `users`:

- **verified** → return full `company_name`, `lanes`, and a contact route.
- **pending** → return a **masked** record: show `lanes`/region + a "Verified carrier · pending" flag; hide name, email, and phone. This is the social-proof listing shippers see.

## Verification paths (all end at `verified`)

1. **Emailed claim link** — each pending carrier has a unique `claim_token`. The link `/claim?token=…` opens a page to confirm details and set a password; on submit we create a `users` row (`user_type = 'company'`), link it (`carriers.user_id`), and set `status = 'verified'`. *Automated sending needs Mailgun; until then the admin copies the link.*
2. **Self-signup + match** — when a company signs up with an email that matches a pending carrier, auto-link the records and mark verified (optionally after a quick admin review).
3. **Admin manual** — the admin flips a pending carrier to verified directly in the admin panel.

## Admin role

- `is_admin` flag on `users`; admin signs in through the normal login.
- Admin-only endpoints (guarded by `is_admin`): list carriers (pending/verified), approve/verify, view/copy claim links, edit a record.
- A simple admin page in the frontend for the above.

## Bulk import script

`backend/import_carriers.py` — reads a CSV and inserts pending carriers with a generated `claim_token`.

Expected CSV columns (adjustable): `company_name, contact_name, email, phone, country, lanes, fmc_id`. Idempotent on `email` (or `fmc_id`) so re-running doesn't duplicate.

## Prerequisites / dependencies

- **Persistent database.** Railway's container filesystem is ephemeral — without a mounted volume at `DB_PATH`, the SQLite DB (and every imported carrier) is wiped on each deploy. A Railway volume must be set up before loading real carrier data.
- **Email (Mailgun)** for automated claim-link sending (path 1). Everything else can be built and used without it; the admin copies links manually in the meantime.

## Suggested build stages

- **Stage 1 — foundation (no email):** schema migration, `carriers` table, `is_admin`, the import script, and masked directory rendering. Delivers pre-loaded masked listings end to end.
- **Stage 2 — admin panel:** list/approve/verify carriers, view and copy claim links.
- **Stage 3 — claim + self-signup:** the `/claim` page + verification endpoint, and self-signup matching.
- **Stage 4 — automated emails:** wire Mailgun to send claim links (pairs with the password-reset work, A14).
