"""
Import carriers into the FreightLink directory as PENDING (masked) records.

Usage:
    python3 import_carriers.py path/to/carriers.csv
    python3 import_carriers.py path/to/carriers.csv --dry-run
    python3 import_carriers.py path/to/carriers.csv --update

The database is chosen via the DB_PATH env var (same as the server), falling back
to ./freight.db next to this script. On Railway, DB_PATH is /data/freight.db.

Modes:
    (default)   Insert new carriers; skip any whose email or fmc_id already exists.
    --update    Also refresh FMC-sourced fields on existing carriers (matched by
                fmc_id, then email). Preserves status, removed, confirmation, and any
                carrier-provided email/lanes. Use this to backfill new columns.

Expected CSV columns (header required; extras ignored, missing treated as blank):
    company_name (required), contact_name, email, phone, country, lanes, fmc_id,
    trade_name, license_number, city, state, zip, street, carrier_type, qi_title,
    renewal_date, fax
"""

import csv
import os
import sys
import secrets
import sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv('DB_PATH', os.path.join(SCRIPT_DIR, 'freight.db'))

FIELDS = ['company_name', 'contact_name', 'email', 'phone', 'country', 'lanes',
          'fmc_id', 'trade_name', 'license_number', 'city', 'state', 'zip',
          'street', 'carrier_type', 'qi_title', 'renewal_date', 'fax']


def ensure_columns(conn):
    """Create the carriers table / add columns if missing (mirrors server migrate_db)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS carriers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            claim_token TEXT UNIQUE,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verified_at TIMESTAMP
        )
    """)
    have = [r[1] for r in conn.execute("PRAGMA table_info(carriers)").fetchall()]
    coltypes = {f: 'TEXT' for f in FIELDS}
    coltypes['removed'] = 'INTEGER DEFAULT 0'
    for col, decl in coltypes.items():
        if col not in have:
            conn.execute(f"ALTER TABLE carriers ADD COLUMN {col} {decl}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_carriers_token ON carriers(claim_token)")


def find_existing(conn, email, fmc_id):
    if fmc_id:
        r = conn.execute("SELECT id FROM carriers WHERE fmc_id = ?", (fmc_id,)).fetchone()
        if r:
            return r[0]
    if email:
        r = conn.execute("SELECT id FROM carriers WHERE email = ?", (email,)).fetchone()
        if r:
            return r[0]
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry_run = '--dry-run' in sys.argv
    update = '--update' in sys.argv
    if not args:
        print("Usage: python3 import_carriers.py path/to/carriers.csv [--dry-run] [--update]")
        sys.exit(1)

    csv_path = args[0]
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    print(f"Database: {DB_PATH}")
    print(f"CSV:      {csv_path}")
    print(f"Mode:     {'update' if update else 'insert-only'}{' (dry run)' if dry_run else ''}")

    conn = sqlite3.connect(DB_PATH)
    ensure_columns(conn)

    added = updated = skipped = blank = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            d = {k: (row.get(k) or '').strip() for k in FIELDS}
            d['email'] = d['email'].lower()
            if not d['company_name']:
                blank += 1
                continue

            existing_id = find_existing(conn, d['email'], d['fmc_id'])
            if existing_id and not update:
                skipped += 1
                continue

            if dry_run:
                if existing_id:
                    updated += 1
                else:
                    added += 1
                continue

            if existing_id:
                conn.execute(
                    """UPDATE carriers SET company_name=?, contact_name=?, phone=?, country=?,
                       fmc_id=?, trade_name=?, license_number=?, city=?, state=?, zip=?, street=?,
                       carrier_type=?, qi_title=?, renewal_date=?, fax=?,
                       email=COALESCE(NULLIF(email,''), ?), lanes=COALESCE(NULLIF(lanes,''), ?)
                       WHERE id=?""",
                    (d['company_name'], d['contact_name'], d['phone'], d['country'], d['fmc_id'],
                     d['trade_name'], d['license_number'], d['city'], d['state'], d['zip'], d['street'],
                     d['carrier_type'], d['qi_title'], d['renewal_date'], d['fax'],
                     d['email'], d['lanes'], existing_id)
                )
                updated += 1
            else:
                token = secrets.token_urlsafe(24)
                conn.execute(
                    """INSERT INTO carriers
                       (company_name, contact_name, email, phone, country, lanes, fmc_id,
                        trade_name, license_number, city, state, zip, street, carrier_type,
                        qi_title, renewal_date, fax, status, claim_token)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)""",
                    (d['company_name'], d['contact_name'], d['email'], d['phone'], d['country'],
                     d['lanes'], d['fmc_id'], d['trade_name'], d['license_number'], d['city'],
                     d['state'], d['zip'], d['street'], d['carrier_type'], d['qi_title'],
                     d['renewal_date'], d['fax'], token)
                )
                added += 1

    if not dry_run:
        conn.commit()
    conn.close()

    print(f"\nDone. Added: {added}  Updated: {updated}  Skipped (duplicate): {skipped}  Skipped (no name): {blank}")


if __name__ == '__main__':
    main()
