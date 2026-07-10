"""
Freight Marketplace Backend — Pure Python stdlib (http.server + sqlite3)
Run: python3 server.py
Serves API at /api/* and static frontend files from ../frontend
"""

import sqlite3
import json
import hashlib
import hmac
import secrets
import os
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import mimetypes

# Config
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.getenv('DB_PATH', os.path.join(SCRIPT_DIR, 'freight.db'))
SCHEMA_PATH = os.path.join(SCRIPT_DIR, 'schema.sql')
FRONTEND_DIR = os.path.join(PROJECT_ROOT, 'frontend')
PORT = int(os.getenv('PORT', 8000))  # Railway sets PORT env var
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY', '')  # Set in production

# ========== Database Setup ==========
def init_db():
    """Ensure all tables exist. schema.sql uses CREATE TABLE IF NOT EXISTS, so this
    is safe to run on every startup (fresh or existing database)."""
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, 'r') as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
    print(f"✓ Database ready at {DB_PATH}")

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def migrate_db():
    """Idempotent migrations so existing databases pick up new tables/columns."""
    conn = get_db()
    cur = conn.cursor()

    # carriers directory table
    cur.execute("""
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
            verified_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers(email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_carriers_token ON carriers(claim_token)")

    # is_admin column on users (only if the table exists and lacks the column)
    tables = [r['name'] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if 'users' in tables:
        cols = [r['name'] for r in cur.execute("PRAGMA table_info(users)").fetchall()]
        if 'is_admin' not in cols:
            cur.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")

    conn.commit()
    conn.close()

# ========== Auth Helpers ==========
def hash_password(password):
    """Hash password with salt"""
    salt = secrets.token_hex(32)
    hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}${hash_obj.hex()}"

def verify_password(password, hash_with_salt):
    """Verify password against hash"""
    try:
        salt, hash_val = hash_with_salt.split('$')
        hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return hash_obj.hex() == hash_val
    except:
        return False

def create_session(user_id):
    """Create auth session token"""
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=30)
    conn = get_db()
    conn.execute(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
        (user_id, token, expires)
    )
    conn.commit()
    conn.close()
    return token

def verify_token(token):
    """Verify session token and return user_id"""
    conn = get_db()
    row = conn.execute(
        'SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")',
        (token,)
    ).fetchone()
    conn.close()
    return row['user_id'] if row else None

# ========== API Handlers ==========
class FreightHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        """Handle GET requests"""
        path = urlparse(self.path).path

        # Static files
        if path == '/' or path.startswith('/index') or path in ('/claim', '/terms', '/privacy'):
            self.serve_static(os.path.join(FRONTEND_DIR, 'index.html'), 'text/html')
        elif path.endswith('.js'):
            self.serve_static(os.path.join(FRONTEND_DIR, path.lstrip('/')), 'application/javascript')
        elif path.endswith('.css'):
            self.serve_static(os.path.join(FRONTEND_DIR, path.lstrip('/')), 'text/css')
        elif path.startswith('/images/'):
            content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'
            self.serve_static(os.path.join(FRONTEND_DIR, path.lstrip('/')), content_type)
        elif path.startswith('/api/'):
            self.handle_api_get(path)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        """Handle POST requests"""
        path = urlparse(self.path).path

        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body) if body else {}
            except:
                data = {}

            self.handle_api_post(path, data)
        else:
            self.send_response(404)
            self.end_headers()

    def serve_static(self, file_path, content_type):
        """Serve static files (restricted to FRONTEND_DIR)"""
        # Prevent path traversal outside the frontend directory
        real_path = os.path.realpath(file_path)
        if not real_path.startswith(os.path.realpath(FRONTEND_DIR) + os.sep):
            self.send_response(404)
            self.end_headers()
            return
        try:
            with open(file_path, 'rb') as f:
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.end_headers()
                self.wfile.write(f.read())
        except (FileNotFoundError, IOError):
            self.send_response(404)
            self.end_headers()

    def handle_api_get(self, path):
        """Route GET API calls"""
        if path == '/api/me':
            self.get_current_user()
        elif path.startswith('/api/shipments'):
            self.get_shipments()
        elif path.startswith('/api/companies'):
            self.get_companies()
        elif path.startswith('/api/inquiries'):
            self.get_inquiries()
        elif path == '/api/admin/carriers':
            self.admin_list_carriers()
        elif path == '/api/claim':
            self.get_claim()
        else:
            self.json_response({'error': 'Not found'}, 404)

    def handle_api_post(self, path, data):
        """Route POST API calls"""
        if path == '/api/signup':
            self.signup(data)
        elif path == '/api/login':
            self.login(data)
        elif path == '/api/shipments':
            self.create_shipment(data)
        elif path == '/api/inquiries':
            self.create_inquiry(data)
        elif path == '/api/checkout':
            self.create_checkout(data)
        elif path == '/api/stripe-webhook':
            self.stripe_webhook(data)
        elif path == '/api/admin/verify':
            self.admin_verify_carrier(data)
        elif path == '/api/claim':
            self.post_claim(data)
        else:
            self.json_response({'error': 'Not found'}, 404)

    def get_token(self):
        """Extract auth token from header"""
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:]
        return None

    def json_response(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    # ========== Auth Endpoints ==========
    def signup(self, data):
        """POST /api/signup - Register new user"""
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        name = data.get('name', '').strip()
        user_type = data.get('user_type', 'shipper')  # 'shipper' or 'company'
        company_name = data.get('company_name', '').strip() if user_type == 'company' else None

        if not all([email, password, name]) or user_type not in ['shipper', 'company']:
            self.json_response({'error': 'Missing required fields'}, 400)
            return

        conn = get_db()
        try:
            conn.execute(
                'INSERT INTO users (email, password_hash, name, user_type, company_name) VALUES (?, ?, ?, ?, ?)',
                (email, hash_password(password), name, user_type, company_name)
            )
            conn.commit()
            user_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]

            # Carriers who sign up directly: link to a pre-loaded record if one matches
            # their email (auto-verify), otherwise add a pending directory record.
            if user_type == 'company':
                match = conn.execute(
                    "SELECT id FROM carriers WHERE email = ? AND user_id IS NULL",
                    (email,)
                ).fetchone()
                if match:
                    conn.execute(
                        "UPDATE carriers SET status = 'verified', user_id = ?, verified_at = datetime('now') WHERE id = ?",
                        (user_id, match['id'])
                    )
                else:
                    conn.execute(
                        "INSERT INTO carriers (company_name, contact_name, email, status, user_id) VALUES (?, ?, ?, 'pending', ?)",
                        (company_name or name, name, email, user_id)
                    )
                conn.commit()

            token = create_session(user_id)
            self.json_response({
                'success': True,
                'user_id': user_id,
                'email': email,
                'token': token,
                'user_type': user_type,
                'is_admin': False
            }, 201)
        except sqlite3.IntegrityError:
            self.json_response({'error': 'Email already registered'}, 400)
        finally:
            conn.close()

    def login(self, data):
        """POST /api/login - Authenticate user"""
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            self.json_response({'error': 'Missing credentials'}, 400)
            return

        conn = get_db()
        user = conn.execute(
            'SELECT id, email, password_hash, user_type, is_admin FROM users WHERE email = ?',
            (email,)
        ).fetchone()
        conn.close()

        if not user or not verify_password(password, user['password_hash']):
            self.json_response({'error': 'Invalid credentials'}, 401)
            return

        token = create_session(user['id'])
        self.json_response({
            'success': True,
            'user_id': user['id'],
            'email': user['email'],
            'token': token,
            'user_type': user['user_type'],
            'is_admin': bool(user['is_admin'])
        })

    def get_current_user(self):
        """GET /api/me - Get current user info"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        conn = get_db()
        user = conn.execute(
            'SELECT id, email, name, user_type, company_name, is_admin FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()
        conn.close()

        if not user:
            self.json_response({'error': 'User not found'}, 404)
            return

        self.json_response({
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'user_type': user['user_type'],
            'company_name': user['company_name'],
            'is_admin': bool(user['is_admin'])
        })

    # ========== Shipment Endpoints ==========
    def create_shipment(self, data):
        """POST /api/shipments - Create new shipment (shipper only)"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        # Verify shipper
        conn = get_db()
        user = conn.execute('SELECT user_type FROM users WHERE id = ?', (user_id,)).fetchone()

        if not user or user['user_type'] != 'shipper':
            self.json_response({'error': 'Only shippers can create shipments'}, 403)
            conn.close()
            return

        origin = data.get('origin', '').strip()
        destination = data.get('destination', '').strip()
        cargo_type = data.get('cargo_type', '').strip()
        weight_tons = data.get('weight_tons')
        budget = data.get('budget')
        shipping_date = data.get('shipping_date', '').strip()
        notes = data.get('notes', '').strip()

        if not all([origin, destination, cargo_type]):
            self.json_response({'error': 'Missing required fields'}, 400)
            conn.close()
            return

        if shipping_date:
            try:
                if datetime.strptime(shipping_date, '%Y-%m-%d').date() < datetime.utcnow().date():
                    self.json_response({'error': 'Shipping date cannot be in the past'}, 400)
                    conn.close()
                    return
            except ValueError:
                self.json_response({'error': 'Invalid shipping date format (expected YYYY-MM-DD)'}, 400)
                conn.close()
                return

        conn.execute(
            'INSERT INTO shipments (shipper_id, origin, destination, cargo_type, weight_tons, budget, shipping_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (user_id, origin, destination, cargo_type, weight_tons, budget, shipping_date, notes)
        )
        conn.commit()
        shipment_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.close()

        self.json_response({'success': True, 'shipment_id': shipment_id}, 201)

    def get_shipments(self, user_type_filter=None):
        """GET /api/shipments - Get shipments (filtered by user)"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        conn = get_db()
        user = conn.execute('SELECT user_type FROM users WHERE id = ?', (user_id,)).fetchone()

        if not user:
            conn.close()
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        if user['user_type'] == 'shipper':
            # Shippers see their own shipments
            shipments = conn.execute(
                'SELECT * FROM shipments WHERE shipper_id = ? AND status = "active" ORDER BY created_at DESC',
                (user_id,)
            ).fetchall()
        else:
            # Companies see all active shipments
            shipments = conn.execute(
                'SELECT * FROM shipments WHERE status = "active" ORDER BY created_at DESC'
            ).fetchall()

        conn.close()

        result = [dict(s) for s in shipments]
        self.json_response({'shipments': result})

    def get_companies(self):
        """GET /api/companies - Carrier directory. Verified carriers show full
        details; pending carriers are masked here so hidden fields never reach the client."""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        conn = get_db()
        carriers = conn.execute(
            """SELECT id, company_name, country, lanes, status
               FROM carriers
               ORDER BY (status = 'verified') DESC, company_name COLLATE NOCASE"""
        ).fetchall()
        conn.close()

        result = []
        for c in carriers:
            if c['status'] == 'verified':
                result.append({
                    'id': c['id'],
                    'status': 'verified',
                    'company_name': c['company_name'],
                    'country': c['country'],
                    'lanes': c['lanes'],
                })
            else:
                # Masked: never expose company_name / contact for pending carriers.
                result.append({
                    'id': c['id'],
                    'status': 'pending',
                    'company_name': None,
                    'country': c['country'],
                    'lanes': c['lanes'],
                })

        self.json_response({'companies': result})

    # ========== Inquiry Endpoints ==========
    def create_inquiry(self, data):
        """POST /api/inquiries - Company inquires about shipment"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        # Verify company
        conn = get_db()
        user = conn.execute('SELECT user_type FROM users WHERE id = ?', (user_id,)).fetchone()

        if not user or user['user_type'] != 'company':
            self.json_response({'error': 'Only companies can inquire about shipments'}, 403)
            conn.close()
            return

        shipment_id = data.get('shipment_id')
        message = data.get('message', '').strip()

        if not shipment_id:
            self.json_response({'error': 'Missing shipment_id'}, 400)
            conn.close()
            return

        conn.execute(
            'INSERT INTO inquiries (shipment_id, company_id, message) VALUES (?, ?, ?)',
            (shipment_id, user_id, message)
        )
        conn.commit()
        inquiry_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.close()

        self.json_response({'success': True, 'inquiry_id': inquiry_id}, 201)

    def get_inquiries(self):
        """GET /api/inquiries - Get inquiries for user's shipments/inquiries"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        conn = get_db()
        user = conn.execute('SELECT user_type FROM users WHERE id = ?', (user_id,)).fetchone()

        if not user:
            conn.close()
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        if user['user_type'] == 'shipper':
            # Shippers see inquiries on their shipments
            inquiries = conn.execute(
                '''SELECT i.*, s.origin, s.destination, u.company_name
                   FROM inquiries i
                   JOIN shipments s ON i.shipment_id = s.id
                   JOIN users u ON i.company_id = u.id
                   WHERE s.shipper_id = ?
                   ORDER BY i.created_at DESC''',
                (user_id,)
            ).fetchall()
        else:
            # Companies see their own inquiries
            inquiries = conn.execute(
                '''SELECT i.*, s.origin, s.destination, u.name
                   FROM inquiries i
                   JOIN shipments s ON i.shipment_id = s.id
                   JOIN users u ON s.shipper_id = u.id
                   WHERE i.company_id = ?
                   ORDER BY i.created_at DESC''',
                (user_id,)
            ).fetchall()

        conn.close()

        result = [dict(i) for i in inquiries]
        self.json_response({'inquiries': result})

    # ========== Admin Endpoints ==========
    def require_admin(self):
        """Return user_id if the caller is an admin, else None."""
        user_id = verify_token(self.get_token())
        if not user_id:
            return None
        conn = get_db()
        row = conn.execute('SELECT is_admin FROM users WHERE id = ?', (user_id,)).fetchone()
        conn.close()
        return user_id if (row and row['is_admin']) else None

    def admin_list_carriers(self):
        """GET /api/admin/carriers - full carrier list (admin only)."""
        if not self.require_admin():
            self.json_response({'error': 'Forbidden'}, 403)
            return

        conn = get_db()
        rows = conn.execute(
            """SELECT id, company_name, contact_name, email, phone, country, lanes,
                      fmc_id, status, claim_token, created_at, verified_at
               FROM carriers
               ORDER BY (status = 'pending') DESC, company_name COLLATE NOCASE"""
        ).fetchall()
        conn.close()
        self.json_response({'carriers': [dict(r) for r in rows]})

    def admin_verify_carrier(self, data):
        """POST /api/admin/verify - flip a carrier's status (admin only)."""
        if not self.require_admin():
            self.json_response({'error': 'Forbidden'}, 403)
            return

        carrier_id = data.get('carrier_id')
        status = data.get('status', 'verified')
        if status not in ('verified', 'pending'):
            status = 'verified'
        if not carrier_id:
            self.json_response({'error': 'Missing carrier_id'}, 400)
            return

        conn = get_db()
        if status == 'verified':
            conn.execute(
                "UPDATE carriers SET status = 'verified', verified_at = datetime('now') WHERE id = ?",
                (carrier_id,)
            )
        else:
            conn.execute(
                "UPDATE carriers SET status = 'pending', verified_at = NULL WHERE id = ?",
                (carrier_id,)
            )
        conn.commit()
        conn.close()
        self.json_response({'success': True})

    # ========== Carrier Claim Endpoints ==========
    def get_claim(self):
        """GET /api/claim?token= - fetch a carrier's details for the claim page."""
        qs = parse_qs(urlparse(self.path).query)
        token = (qs.get('token') or [''])[0]
        if not token:
            self.json_response({'error': 'Missing token'}, 400)
            return

        conn = get_db()
        c = conn.execute(
            """SELECT company_name, contact_name, email, phone, country, lanes, status, user_id
               FROM carriers WHERE claim_token = ?""",
            (token,)
        ).fetchone()
        conn.close()

        if not c:
            self.json_response({'error': 'This claim link is not valid.'}, 404)
            return

        self.json_response({
            'company_name': c['company_name'],
            'contact_name': c['contact_name'],
            'email': c['email'],
            'phone': c['phone'],
            'country': c['country'],
            'lanes': c['lanes'],
            'claimed': c['user_id'] is not None
        })

    def post_claim(self, data):
        """POST /api/claim - confirm details, set a password, create the account, verify."""
        token = data.get('token', '')
        password = data.get('password', '')
        if not token or not password:
            self.json_response({'error': 'Missing token or password'}, 400)
            return

        conn = get_db()
        c = conn.execute("SELECT * FROM carriers WHERE claim_token = ?", (token,)).fetchone()
        if not c:
            conn.close()
            self.json_response({'error': 'This claim link is not valid.'}, 404)
            return
        if c['user_id'] is not None:
            conn.close()
            self.json_response({'error': 'This listing has already been claimed. Please log in.'}, 400)
            return

        email = (c['email'] or '').strip().lower()
        if not email:
            conn.close()
            self.json_response({'error': 'No email is on file for this carrier. Please contact support.'}, 400)
            return

        if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            conn.close()
            self.json_response({'error': 'An account with this email already exists. Please log in.'}, 400)
            return

        contact_name = (data.get('contact_name') or c['contact_name'] or c['company_name']).strip()
        phone = (data.get('phone') or c['phone'] or '').strip()
        lanes = (data.get('lanes') or c['lanes'] or '').strip()

        conn.execute(
            "INSERT INTO users (email, password_hash, name, user_type, company_name) VALUES (?, ?, ?, 'company', ?)",
            (email, hash_password(password), contact_name, c['company_name'])
        )
        user_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.execute(
            """UPDATE carriers SET status = 'verified', user_id = ?, verified_at = datetime('now'),
               contact_name = ?, phone = ?, lanes = ? WHERE id = ?""",
            (user_id, contact_name, phone, lanes, c['id'])
        )
        conn.commit()
        conn.close()

        session_token = create_session(user_id)
        self.json_response({
            'success': True,
            'user_id': user_id,
            'email': email,
            'token': session_token,
            'user_type': 'company',
            'is_admin': False
        }, 201)

    # ========== Payment Endpoints (Stripe) ==========
    def create_checkout(self, data):
        """POST /api/checkout - Create Stripe checkout session"""
        token = self.get_token()
        user_id = verify_token(token)

        if not user_id:
            self.json_response({'error': 'Unauthorized'}, 401)
            return

        conn = get_db()
        user = conn.execute('SELECT user_type FROM users WHERE id = ?', (user_id,)).fetchone()
        conn.close()

        # TODO: Integrate with Stripe API
        # For now, return placeholder
        self.json_response({'error': 'Stripe integration in progress'}, 501)

    def stripe_webhook(self, data):
        """POST /api/stripe-webhook - Handle Stripe webhooks"""
        # TODO: Implement webhook signature verification and payment handling
        self.json_response({'received': True})

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

# ========== Main ==========
if __name__ == '__main__':
    init_db()
    migrate_db()

    server = ThreadingHTTPServer(('0.0.0.0', PORT), FreightHandler)
    print(f"✓ Freight Marketplace server running at http://localhost:{PORT}")
    print(f"  API: http://localhost:{PORT}/api/*")
    print(f"  Frontend: http://localhost:{PORT}/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
        server.shutdown()
