"""
Bulk-import carriers into the FreightLink directory as PENDING (masked) records.

Usage:
    python3 import_carriers.py path/to/carriers.csv
    python3 import_carriers.py path/to/carriers.csv --dry-run

The database is chosen via the DB_PATH env var (same as the server), falling back
to ./freight.db next to this script. On Railway, DB_PATH is /data/freight.db, so run
this from the service Console after making the CSV available in the container.

Expected CSV columns (header row required; extra columns are ignored, missing ones
are treated as blank):
    company_name   (required)
    contact_name
    email
    phone
    country
    lanes          e.g. "Asia-US West Coast"
    fmc_id         NVOCC registry reference

Idempotent: a row is skipped if a carrier with the same email (or same fmc_id) already
exists, so re-running the script won't create duplicates.
"""

import csv
import os
import sys
import secrets
import sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv('DB_PATH', os.path.join(SCRIPT_DIR, 'freight.db'))

FIELDS = ['company_name', 'contact_name', 'email', 'phone', 'country', 'lanes', 'fmc_id']


def ensure_table(conn):
    """Create the carriers table if it doesn't exist (mirrors server migrate_db)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS carriers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            contact_name TEXT,
            email TEXT,
            phone TEXT,
            country TEXT,
            lanes TEXT,
            fmc_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified')),
            claim_token TEXT UNIQUE,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verified_at TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_carriers_token ON carriers(claim_token)")


def already_exists(conn, email, fmc_id):
    if email:
        if conn.execute("SELECT 1 FROM carriers WHERE email = ?", (email,)).fetchone():
            return True
    if fmc_id:
        if conn.execute("SELECT 1 FROM carriers WHERE fmc_id = ?", (fmc_id,)).fetchone():
            return True
    return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry_run = '--dry-run' in sys.argv

    if not args:
        print("Usage: python3 import_carriers.py path/to/carriers.csv [--dry-run]")
        sys.exit(1)

    csv_path = args[0]
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    print(f"Database: {DB_PATH}")
    print(f"CSV:      {csv_path}")
    if dry_run:
        print("(dry run — no rows will be written)")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_table(conn)

    added = skipped = blank = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data = {k: (row.get(k) or '').strip() for k in FIELDS}
            data['email'] = data['email'].lower()

            if not data['company_name']:
                blank += 1
                continue

            if already_exists(conn, data['email'], data['fmc_id']):
                skipped += 1
                continue

            if dry_run:
                added += 1
                continue

            token = secrets.token_urlsafe(24)
            conn.execute(
                """INSERT INTO carriers
                   (company_name, contact_name, email, phone, country, lanes, fmc_id, status, claim_token)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
                (data['company_name'], data['contact_name'], data['email'], data['phone'],
                 data['country'], data['lanes'], data['fmc_id'], token)
            )
            added += 1

    if not dry_run:
        conn.commit()
    conn.close()

    print(f"\nDone. Added: {added}  Skipped (duplicate): {skipped}  Skipped (no company_name): {blank}")


if __name__ == '__main__':
    main()
