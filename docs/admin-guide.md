# MRFreighter — Admin Guide

Admin is **not a separate account type** — it's a flag (`is_admin`) on a normal user
account, granted with a helper script from the Railway Console.

## Make someone an admin

1. **Create a normal account** on the site first (sign up as a shipper or carrier)
   with the email you want to make admin. The script only flags an existing user.

2. In **Railway** → the **freight-marketplace** service → **Console** tab (a shell
   inside the running container; the database is already at `/data/freight.db`), run:

   ```
   python3 backend/make_admin.py you@email.com
   ```

   You should see: `Granted admin to you@email.com.`

3. **Log out and log back in** on the site. The app reads the `is_admin` flag at
   login, so you'll now land on the **Admin** panel instead of the normal dashboard.

## Common variations

- **Revoke admin:**
  ```
  python3 backend/make_admin.py you@email.com --revoke
  ```
- **"No user found" error:** the account doesn't exist yet — sign up on the site
  first, then re-run the command.
- **Reset a password (if locked out):**
  ```
  python3 backend/set_password.py you@email.com 'NewPassword'
  ```

## Notes

- There is intentionally **no "create admin" button** in the UI — admins are managed
  only via this script, so the role can't be self-granted.
- Admins are **hidden from the Shippers list** in the panel: they're recorded in the
  database but excluded from the user population shown to admins.
- These scripts run in the deployed container's Console, where `DB_PATH=/data/freight.db`
  is already set, so they act on the live (volume-backed) database.
