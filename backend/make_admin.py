"""
Grant (or revoke) admin rights for a MRFreighter user.

Usage:
    python3 make_admin.py user@example.com          # grant admin
    python3 make_admin.py user@example.com --revoke  # revoke admin

Uses DB_PATH (same as the server), falling back to ./freight.db next to this script.
On Railway, run it from the service Console where DB_PATH=/data/freight.db is set.
The user must already have an account (sign up first).
"""

import os
import sys
import sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv('DB_PATH', os.path.join(SCRIPT_DIR, 'freight.db'))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    revoke = '--revoke' in sys.argv
    if not args:
        print("Usage: python3 make_admin.py user@example.com [--revoke]")
        sys.exit(1)

    email = args[0].strip().lower()
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        print(f"No user found with email {email}. Have them sign up first.")
        sys.exit(1)

    conn.execute("UPDATE users SET is_admin = ? WHERE email = ?", (0 if revoke else 1, email))
    conn.commit()
    conn.close()
    print(f"{'Revoked admin from' if revoke else 'Granted admin to'} {email}.")


if __name__ == '__main__':
    main()
