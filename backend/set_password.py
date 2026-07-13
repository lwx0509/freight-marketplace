"""
Set (reset) a MRFreighter user's password.

Usage:
    python3 set_password.py user@example.com 'NewPassword123'

Uses DB_PATH (same as the server), falling back to ./freight.db next to this script.
On Railway, run it from the service Console where DB_PATH=/data/freight.db is set.
The user must already have an account.
"""

import os
import sys
import hashlib
import secrets
import sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv('DB_PATH', os.path.join(SCRIPT_DIR, 'freight.db'))


def hash_password(password):
    salt = secrets.token_hex(32)
    hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}${hash_obj.hex()}"


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 set_password.py user@example.com 'NewPassword'")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2]
    if len(new_password) < 6:
        print("Password should be at least 6 characters.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        print(f"No user found with email {email}.")
        sys.exit(1)

    conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hash_password(new_password), email))
    conn.commit()
    conn.close()
    print(f"Password updated for {email}.")


if __name__ == '__main__':
    main()
