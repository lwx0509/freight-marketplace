/**
 * Freight Marketplace Frontend
 * Vanilla JavaScript SPA
 */

const COUNTRIES = ["Afghanistan","Albania","Algeria","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bermuda","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Cambodia","Cameroon","Canada","Cape Verde","Chile","China","Colombia","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Guatemala","Guinea","Guyana","Haiti","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Laos","Latvia","Lebanon","Liberia","Libya","Lithuania","Luxembourg","Macau","Madagascar","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Macedonia","Norway","Oman","Pakistan","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];

const CITIES = ["Shanghai","Ningbo","Shenzhen","Guangzhou","Qingdao","Tianjin","Xiamen","Dalian","Hong Kong","Singapore","Busan","Kaohsiung","Keelung","Tokyo","Yokohama","Kobe","Nagoya","Osaka","Port Klang","Tanjung Pelepas","Jakarta","Surabaya","Manila","Laem Chabang","Bangkok","Ho Chi Minh City","Haiphong","Colombo","Chennai","Mumbai","Nhava Sheva","Mundra","Kolkata","Karachi","Chittagong","Dubai","Jebel Ali","Abu Dhabi","Dammam","Jeddah","Doha","Kuwait City","Salalah","Aqaba","Rotterdam","Antwerp","Hamburg","Bremerhaven","Felixstowe","London","Southampton","Le Havre","Marseille","Barcelona","Valencia","Algeciras","Genoa","La Spezia","Gioia Tauro","Piraeus","Istanbul","Izmir","Gdansk","Gothenburg","Zeebrugge","Dublin","Lisbon","Los Angeles","Long Beach","Oakland","Seattle","Tacoma","New York","Newark","Savannah","Charleston","Houston","Miami","Norfolk","Baltimore","Boston","Vancouver","Montreal","Toronto","Halifax","Manzanillo","Veracruz","Lazaro Cardenas","Santos","Rio de Janeiro","Paranagua","Buenos Aires","Callao","Cartagena","Guayaquil","Valparaiso","San Antonio","Colon","Balboa","Kingston","Durban","Cape Town","Port Elizabeth","Lagos","Tema","Abidjan","Mombasa","Dar es Salaam","Alexandria","Port Said","Tangier","Casablanca","Sydney","Melbourne","Brisbane","Fremantle","Auckland"];

const app = {
    apiUrl: '',
    user: null,
    token: null,

    populateLocationInputs() {
        const countryOpts = '<option value="">Country</option>' +
            COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('');
        ['shipmentOriginCountry', 'shipmentDestCountry'].forEach(id => {
            const el = document.getElementById(id); if (el) el.innerHTML = countryOpts;
        });
        const dl = document.getElementById('cityList');
        if (dl) dl.innerHTML = CITIES.map(c => `<option value="${c}"></option>`).join('');
        const today = new Date().toISOString().slice(0, 10);
        ['shipmentReadyDate', 'shipmentDeadline'].forEach(id => {
            const el = document.getElementById(id); if (el) el.min = today;
        });
    },

    init() {
        this.populateLocationInputs();
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');

        // Direct routes to legal pages (e.g. opened in a new tab from signup)
        if (window.location.pathname === '/terms') {
            this.showPage('termsPage');
            return;
        }
        if (window.location.pathname === '/privacy') {
            this.showPage('privacyPage');
            return;
        }

        // Carrier claim link: /claim?token=...
        const params = new URLSearchParams(window.location.search);
        if (window.location.pathname === '/claim' && params.get('token')) {
            this.startClaim(params.get('token'));
            return;
        }

        if (this.token && this.user) {
            if (this.user.is_admin) {
                this.showPage('adminPage');
                this.loadAdmin();
            } else {
                this.showPage('dashboardPage');
                this.loadDashboard();
            }
        } else {
            this.showPage('landingPage');
        }
    },

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        const page = document.getElementById(pageId);
        if (page) page.classList.remove('hidden');
    },

    showSignup(userType) {
        document.getElementById('signupUserType').value = userType;
        const field = document.getElementById('companyNameField');
        const input = document.getElementById('signupCompanyName');
        const isCompany = userType === 'company';

        field.style.display = isCompany ? 'block' : 'none';
        input.required = isCompany;

        document.getElementById('shipperInfo').style.display = isCompany ? 'none' : 'block';
        document.getElementById('companyInfo').style.display = isCompany ? 'block' : 'none';
        document.getElementById('signupTitle').textContent = isCompany ? 'Sign Up as a Carrier' : 'Sign Up as a Shipper';

        this.showPage('signupPage');
    },

    async handleSignup(event) {
        event.preventDefault();

        const email = document.getElementById('signupEmail').value;
        const name = document.getElementById('signupName').value;
        const password = document.getElementById('signupPassword').value;
        const userType = document.getElementById('signupUserType').value;
        const companyName = document.getElementById('signupCompanyName').value;
        const errorEl = document.getElementById('signupError');

        errorEl.textContent = '';

        const payload = { email, name, password, user_type: userType };
        if (userType === 'company') payload.company_name = companyName;

        try {
            const res = await fetch(`${this.apiUrl}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || 'Signup failed';
                return;
            }

            this.token = data.token;
            this.user = { id: data.user_id, email: data.email, user_type: data.user_type, is_admin: false };

            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.showPage('dashboardPage');
            this.loadDashboard();
        } catch (err) {
            errorEl.textContent = 'Network error';
            console.error(err);
        }
    },

    async handleLogin(event) {
        event.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');

        errorEl.textContent = '';

        try {
            const res = await fetch(`${this.apiUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || 'Login failed';
                return;
            }

            this.token = data.token;
            this.user = { id: data.user_id, email: data.email, user_type: data.user_type, is_admin: !!data.is_admin };

            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            if (this.user.is_admin) {
                this.showPage('adminPage');
                this.loadAdmin();
            } else {
                this.showPage('dashboardPage');
                this.loadDashboard();
            }
        } catch (err) {
            errorEl.textContent = 'Network error';
            console.error(err);
        }
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user = null;
        this.showPage('landingPage');
    },

    async submitChangePw(event) {
        event.preventDefault();
        const note = document.getElementById('cpNote');
        note.style.color = '#e24b4a';
        const cur = document.getElementById('cpCurrent').value;
        const nw = document.getElementById('cpNew').value;
        const conf = document.getElementById('cpConfirm').value;
        if (nw !== conf) { note.textContent = 'New passwords do not match.'; return; }
        try {
            const res = await fetch(`${this.apiUrl}/api/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify({ current_password: cur, new_password: nw })
            });
            const data = await res.json();
            if (!res.ok) { note.textContent = data.error || 'Could not change password.'; return; }
            note.style.color = '#1d9e75';
            note.textContent = 'Password updated.';
            document.getElementById('cpCurrent').value = '';
            document.getElementById('cpNew').value = '';
            document.getElementById('cpConfirm').value = '';
        } catch (err) {
            note.textContent = 'Network error';
        }
    },

    // ========== Dashboard tabs + account (shared by shipper & carrier) ==========
    switchDashTab(tab) {
        const panels = { post: 'dpPost', ship: 'dpShip', carriers: 'dpCarriers', inquiries: 'dpInquiries', account: 'dpAccount' };
        const btns = { post: 'dtPost', ship: 'dtShip', carriers: 'dtCarriers', inquiries: 'dtInquiries', account: 'dtAccount' };
        Object.keys(panels).forEach(t => {
            const p = document.getElementById(panels[t]); if (p) p.style.display = (t === tab) ? 'block' : 'none';
            const b = document.getElementById(btns[t]); if (b) b.classList.toggle('active', t === tab);
        });
    },

    switchCompanyTab(tab) {
        const panels = { ship: 'cpanShip', inquiries: 'cpanInq', account: 'cpanAccount' };
        const btns = { ship: 'ctShip', inquiries: 'ctInq', account: 'ctAccount' };
        Object.keys(panels).forEach(t => {
            const p = document.getElementById(panels[t]); if (p) p.style.display = (t === tab) ? 'block' : 'none';
            const b = document.getElementById(btns[t]); if (b) b.classList.toggle('active', t === tab);
        });
    },

    async loadProfile(prefix) {
        prefix = prefix || '';
        try {
            const res = await fetch(`${this.apiUrl}/api/me`, { headers: { 'Authorization': `Bearer ${this.token}` } });
            if (!res.ok) return;
            const u = await res.json();
            const set = (id, v) => { const el = document.getElementById(prefix + id); if (el) el.value = v || ''; };
            set('acctName', u.name); set('acctEmail', u.email); set('acctCompany', u.company_name);
        } catch (err) { console.error('Failed to load profile:', err); }
    },

    async saveProfile(event, prefix) {
        event.preventDefault();
        prefix = prefix || '';
        const g = (id) => document.getElementById(prefix + id);
        const note = g('acctProfileNote');
        note.style.color = '#e24b4a';
        const payload = { name: g('acctName').value, email: g('acctEmail').value, company_name: g('acctCompany').value };
        try {
            const res = await fetch(`${this.apiUrl}/api/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) { note.textContent = data.error || 'Could not save profile.'; return; }
            this.user.email = data.email;
            localStorage.setItem('user', JSON.stringify(this.user));
            const disp = document.getElementById('userDisplay'); if (disp) disp.textContent = data.email;
            note.style.color = '#1d9e75';
            note.textContent = 'Profile saved.';
        } catch (err) { note.textContent = 'Network error'; }
    },

    async submitAccountPw(event, prefix) {
        event.preventDefault();
        prefix = prefix || '';
        const g = (id) => document.getElementById(prefix + id);
        const note = g('acctPwNote');
        note.style.color = '#e24b4a';
        const cur = g('acctCur').value, nw = g('acctNew').value, conf = g('acctConf').value;
        if (nw !== conf) { note.textContent = 'New passwords do not match.'; return; }
        try {
            const res = await fetch(`${this.apiUrl}/api/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify({ current_password: cur, new_password: nw })
            });
            const data = await res.json();
            if (!res.ok) { note.textContent = data.error || 'Could not change password.'; return; }
            note.style.color = '#1d9e75';
            note.textContent = 'Password updated.';
            g('acctCur').value = ''; g('acctNew').value = ''; g('acctConf').value = '';
        } catch (err) { note.textContent = 'Network error'; }
    },

    async deleteAccount(event, prefix) {
        event.preventDefault();
        prefix = prefix || '';
        const g = (id) => document.getElementById(prefix + id);
        const note = g('acctDelNote');
        note.style.color = '#e24b4a';
        if (!confirm('Delete your account permanently? This cannot be undone.')) return;
        try {
            const res = await fetch(`${this.apiUrl}/api/account/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify({ password: g('acctDelPw').value })
            });
            const data = await res.json();
            if (!res.ok) { note.textContent = data.error || 'Could not delete account.'; return; }
            this.logout();
        } catch (err) { note.textContent = 'Network error'; }
    },

    // ========== Carrier claim ==========
    async startClaim(token) {
        this.claimToken = token;
        this.showPage('claimPage');
        try {
            const res = await fetch(`${this.apiUrl}/api/claim?token=${encodeURIComponent(token)}`);
            const data = await res.json();
            if (!res.ok) { this.showClaimInvalid(data.error || 'This link is not valid.'); return; }
            document.getElementById('claimCompany').textContent = data.company_name || '';
            document.getElementById('claimContact').value = data.contact_name || '';
            document.getElementById('claimPhone').value = data.phone || '';
            document.getElementById('claimLanes').value = data.lanes || '';
        } catch (err) {
            this.showClaimInvalid('Something went wrong loading this link.');
        }
    },

    showClaimInvalid(msg) {
        document.getElementById('claimForm').style.display = 'none';
        document.getElementById('claimInvalid').style.display = 'block';
        document.getElementById('claimInvalidMsg').textContent = msg;
    },

    async submitClaim(action) {
        const errorEl = document.getElementById('claimError');
        errorEl.textContent = '';
        const payload = {
            token: this.claimToken,
            action: action,
            contact_name: document.getElementById('claimContact').value,
            phone: document.getElementById('claimPhone').value,
            lanes: document.getElementById('claimLanes').value
        };
        try {
            const res = await fetch(`${this.apiUrl}/api/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) { errorEl.textContent = data.error || 'Something went wrong.'; return; }
            document.getElementById('claimForm').style.display = 'none';
            const done = document.getElementById('claimDone');
            done.style.display = 'block';
            if (action === 'confirm') {
                document.getElementById('claimDoneTitle').textContent = 'Your listing is confirmed';
                document.getElementById('claimDoneMsg').textContent = 'Thanks — your company is now listed on Mr. Freighter. You can request removal at any time by contacting us.';
            } else {
                document.getElementById('claimDoneTitle').textContent = 'Your information has been removed';
                document.getElementById('claimDoneMsg').textContent = 'Your company will not be listed on Mr. Freighter.';
            }
        } catch (err) {
            errorEl.textContent = 'Network error';
        }
    },

    async loadDashboard() {
        if (!this.token || !this.user) return;

        // Show appropriate dashboard
        const shipperDash = document.getElementById('shipperDashboard');
        const companyDash = document.getElementById('companyDashboard');

        if (this.user.user_type === 'shipper') {
            shipperDash.classList.remove('hidden');
            companyDash.classList.add('hidden');
            this.loadShipperDashboard();
        } else {
            shipperDash.classList.add('hidden');
            companyDash.classList.remove('hidden');
            this.loadCompanyDashboard();
        }

        // Update user display
        document.getElementById('userDisplay').textContent = `${this.user.email}`;
    },

    async loadShipperDashboard() {
        try {
            const res = await fetch(`${this.apiUrl}/api/shipments`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!res.ok) return;

            const data = await res.json();
            this.renderShipments(data.shipments || []);

            // Check access status
            await this.checkShipperAccess();
            await this.loadShipperInquiries();
            this.loadProfile();
        } catch (err) {
            console.error('Failed to load shipper dashboard:', err);
        }
    },

    async loadCompanyDashboard() {
        try {
            // Load available shipments
            const res = await fetch(`${this.apiUrl}/api/shipments`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (res.ok) {
                const data = await res.json();
                this.renderAvailableShipments(data.shipments || []);
            }

            // Load inquiries
            await this.loadCompanyInquiries();
            this.loadProfile('c');

            // Check subscription status
            // TODO: Check if company has active subscription
        } catch (err) {
            console.error('Failed to load company dashboard:', err);
        }
    },

    // ========== Admin ==========
    async loadAdmin() {
        await this.loadAdminUsers();
        await this.loadAdminCarriers();
    },

    async loadAdminUsers() {
        if (!this.token) return;
        try {
            const res = await fetch(`${this.apiUrl}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            this.renderAdminShippers(data.users || []);
        } catch (err) {
            console.error('Failed to load admin users:', err);
        }
    },

    renderAdminShippers(users) {
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
        ));
        const shippers = users.filter(u => u.user_type === 'shipper' && !u.is_admin);
        const body = document.getElementById('adminShippersBody');
        const count = document.getElementById('adminShippersCount');
        if (count) count.textContent = `(${shippers.length})`;
        if (!shippers.length) {
            body.innerHTML = '<tr><td colspan="3">No shippers yet.</td></tr>';
            return;
        }
        body.innerHTML = shippers.map(u => {
            const joined = u.created_at ? esc(String(u.created_at).slice(0, 10)) : '—';
            return `<tr>
                <td>${esc(u.name) || '—'}</td>
                <td>${esc(u.email)}</td>
                <td>${joined}</td>
            </tr>`;
        }).join('');
    },

    switchAdminTab(name) {
        const isCarriers = name === 'carriers';
        document.getElementById('carriersPanel').style.display = isCarriers ? 'block' : 'none';
        document.getElementById('shippersPanel').style.display = isCarriers ? 'none' : 'block';
        document.getElementById('tabCarriers').classList.toggle('active', isCarriers);
        document.getElementById('tabShippers').classList.toggle('active', !isCarriers);
    },

    filterTable(inputId, tbodyId) {
        const q = (document.getElementById(inputId).value || '').toLowerCase();
        const rows = document.getElementById(tbodyId).querySelectorAll('tr');
        rows.forEach(r => {
            r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    },

    // Filter table rows by a text search plus any number of facet selects.
    // facets: [{ selectId, attr }] where attr is a data-* key on each <tr>.
    filterRows(searchId, tbodyId, facets) {
        const searchEl = document.getElementById(searchId);
        const q = (searchEl ? searchEl.value : '').toLowerCase();
        const fac = (facets || []).map(f => {
            const el = document.getElementById(f.selectId);
            return { val: el ? el.value : 'all', attr: f.attr };
        });
        document.getElementById(tbodyId).querySelectorAll('tr').forEach(r => {
            if (r.children.length <= 1) return;
            let show = r.textContent.toLowerCase().includes(q);
            for (const f of fac) {
                if (show && f.val !== 'all' && (r.dataset[f.attr] || '') !== f.val) show = false;
            }
            r.style.display = show ? '' : 'none';
        });
    },

    async loadAdminCarriers() {
        if (!this.token) return;
        try {
            const res = await fetch(`${this.apiUrl}/api/admin/carriers`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            this.renderAdminCarriers(data.carriers || []);
        } catch (err) {
            console.error('Failed to load admin carriers:', err);
        }
    },

    renderAdminCarriers(carriers) {
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
        ));
        const body = document.getElementById('adminCarriersBody');
        const count = document.getElementById('adminCarriersCount');
        const pending = carriers.filter(c => c.status === 'pending').length;
        if (count) count.textContent = `(${carriers.length}${pending ? `, ${pending} pending` : ''})`;

        if (!carriers.length) {
            body.innerHTML = '<tr><td colspan="11">No carriers imported yet.</td></tr>';
            return;
        }

        const origin = window.location.origin;
        body.innerHTML = carriers.map(c => {
            const link = c.claim_token ? `${origin}/claim?token=${encodeURIComponent(c.claim_token)}` : '';
            let badge, actions;
            if (c.removed) {
                badge = '<span class="company-badge company-badge--removed">Removed</span>';
                actions = `<button class="btn-secondary btn-sm" onclick="app.verifyCarrier(${c.id}, 'restore')">Restore</button>`;
            } else if (c.status === 'verified') {
                badge = '<span class="company-badge company-badge--verified">Confirmed</span>';
                actions = `<button class="btn-secondary btn-sm" onclick="app.verifyCarrier(${c.id}, 'unconfirm')">Unconfirm</button>
                           <button class="btn-secondary btn-sm" onclick="app.verifyCarrier(${c.id}, 'remove')">Remove</button>`;
            } else {
                badge = '<span class="company-badge company-badge--pending">Pending</span>';
                actions = `<button class="btn-primary btn-sm" onclick="app.verifyCarrier(${c.id}, 'confirm')">Confirm</button>
                           <button class="btn-secondary btn-sm" onclick="app.verifyCarrier(${c.id}, 'remove')">Remove</button>`;
            }
            const location = esc([c.city, c.state, c.country].filter(Boolean).join(', ')) || '—';
            const type = esc(c.carrier_type) || '—';
            const linkCell = link
                ? `<button class="btn-link btn-sm" onclick="app.copyText('${link.replace(/'/g, "\\'")}', this)">Copy</button>`
                : '—';
            return `<tr>
                <td class="col-company">${esc(c.company_name)}</td>
                <td>${esc(c.trade_name) || '—'}</td>
                <td>${esc(c.contact_name) || '—'}</td>
                <td>${esc(c.email) || '—'}</td>
                <td>${type}</td>
                <td>${location}</td>
                <td>${esc(c.license_number) || '—'}</td>
                <td>${esc(c.renewal_date) || '—'}</td>
                <td>${badge}</td>
                <td>${linkCell}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    },

    async verifyCarrier(id, action) {
        try {
            const res = await fetch(`${this.apiUrl}/api/admin/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify({ carrier_id: id, action })
            });
            if (res.ok) this.loadAdminCarriers();
        } catch (err) {
            console.error('Failed to update carrier:', err);
        }
    },

    copyText(text, btn) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = t, 1200); }
            });
        }
    },

    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
        ));
    },

    // Sort a table by the clicked <th>. type 'number' sorts numerically; cells may
    // carry a data-sort attribute to control the sort key independently of display.
    sortTable(th, type) {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        const headers = Array.from(th.parentNode.children);
        const idx = headers.indexOf(th);
        const asc = th.getAttribute('data-dir') !== 'asc';
        headers.forEach(h => { h.removeAttribute('data-dir'); h.classList.remove('sorted-asc', 'sorted-desc'); });
        th.setAttribute('data-dir', asc ? 'asc' : 'desc');
        th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.children.length > 1);
        const key = (r) => {
            const c = r.children[idx];
            if (!c) return '';
            return c.dataset.sort != null ? c.dataset.sort : c.textContent.trim();
        };
        rows.sort((a, b) => {
            let x = key(a), y = key(b);
            if (type === 'number') {
                x = parseFloat(x); y = parseFloat(y);
                if (isNaN(x)) x = -Infinity; if (isNaN(y)) y = -Infinity;
                return asc ? x - y : y - x;
            }
            return asc ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x));
        });
        rows.forEach(r => tbody.appendChild(r));
    },

    shipmentRow(s, actionCell) {
        const esc = this.esc;
        const weight = (s.weight_tons != null && s.weight_tons !== '') ? esc(s.weight_tons) + ' t' : '—';
        const budget = (s.budget != null && s.budget !== '') ? '$' + esc(s.budget) : '—';
        return `<tr data-status="${esc(s.status || '')}">
            <td>${esc(s.origin)} → ${esc(s.destination)}</td>
            <td>${esc(s.cargo_type)}</td>
            <td data-sort="${s.weight_tons || 0}">${weight}</td>
            <td data-sort="${s.budget || 0}">${budget}</td>
            <td>${esc(s.shipping_date) || '—'}</td>
            <td>${esc(s.deadline) || '—'}</td>
            ${actionCell(s)}
        </tr>`;
    },

    renderShipments(shipments) {
        const body = document.getElementById('shipmentsBody');
        if (!shipments.length) {
            body.innerHTML = '<tr><td colspan="7">No shipments posted yet.</td></tr>';
            return;
        }
        body.innerHTML = shipments.map(s => this.shipmentRow(s, ss => `<td>${this.esc(ss.status)}</td>`)).join('');
    },

    renderAvailableShipments(shipments) {
        const body = document.getElementById('availableShipmentsBody');
        if (!shipments.length) {
            body.innerHTML = '<tr><td colspan="7">No shipments available at this time.</td></tr>';
            return;
        }
        body.innerHTML = shipments.map(s => this.shipmentRow(s, ss =>
            `<td><button class="btn-primary btn-sm" onclick="app.openInquiryForm(${ss.id})">Inquire</button></td>`)).join('');
    },

    async handleCreateShipment(event) {
        event.preventDefault();

        const loc = (cityId, countryId) => {
            const city = document.getElementById(cityId).value.trim();
            const country = document.getElementById(countryId).value.trim();
            return [city, country].filter(Boolean).join(', ');
        };
        const ready = document.getElementById('shipmentReadyDate').value;
        const deadline = document.getElementById('shipmentDeadline').value;
        if (ready && deadline && deadline < ready) {
            alert('Deadline cannot be earlier than the ready date');
            return;
        }

        const payload = {
            origin: loc('shipmentOriginCity', 'shipmentOriginCountry'),
            destination: loc('shipmentDestCity', 'shipmentDestCountry'),
            cargo_type: document.getElementById('shipmentCargoType').value,
            weight_tons: parseFloat(document.getElementById('shipmentWeight').value) || null,
            budget: parseFloat(document.getElementById('shipmentBudget').value) || null,
            shipping_date: ready,
            deadline: deadline,
            notes: document.getElementById('shipmentNotes').value
        };

        try {
            const res = await fetch(`${this.apiUrl}/api/shipments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                alert('Failed to create shipment');
                return;
            }

            // Clear form
            event.target.reset();

            // Reload dashboard
            this.loadShipperDashboard();
            alert('Shipment posted successfully!');
        } catch (err) {
            console.error('Failed to create shipment:', err);
            alert('Error creating shipment');
        }
    },

    async checkShipperAccess() {
        // TODO: enforce real access once payments are wired up.
        document.getElementById('buyAccessBtn').style.display = 'inline-flex';
        document.getElementById('accessStatus').textContent =
            "You don't have active directory access yet. Full access is $10/month.";

        // Directory currently loads regardless (gate not enforced yet).
        try {
            const res = await fetch(`${this.apiUrl}/api/companies`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (res.ok) {
                const data = await res.json();
                this.renderCompanies(data.companies || []);
            }
        } catch (err) {
            console.error('Failed to load companies:', err);
        }
    },

    renderCompanies(companies) {
        const container = document.getElementById('companiesList');

        if (!companies || companies.length === 0) {
            container.innerHTML = '<p>No carriers available yet.</p>';
            container.style.display = 'block';
            return;
        }

        this._carriers = companies || [];
        this.populateCarrierFacets(this._carriers);
        this.applyCarrierFilter();
    },

    populateCarrierFacets(list) {
        const fill = (id, values, label) => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = ['<option value="all">' + label + '</option>']
                .concat(values.map(v => `<option value="${this.esc(v)}">${this.esc(v)}</option>`)).join('');
            if (values.indexOf(current) !== -1) sel.value = current;
        };
        const uniq = (key) => Array.from(new Set(list.map(c => c[key]).filter(Boolean))).sort();
        fill('carrierDirType', uniq('carrier_type'), 'All types');
        fill('carrierDirCountry', uniq('country'), 'All countries');
    },

    applyCarrierFilter() {
        const list = this._carriers || [];
        const val = (id) => { const el = document.getElementById(id); return el ? el.value : 'all'; };
        const searchEl = document.getElementById('carrierDirSearch');
        const q = (searchEl ? searchEl.value : '').toLowerCase();
        const sort = val('carrierDirSort');
        const fType = val('carrierDirType');
        const fCountry = val('carrierDirCountry');
        const fStatus = val('carrierDirStatus');
        const hasContactEl = document.getElementById('carrierDirHasContact');
        const hasContactOnly = hasContactEl ? hasContactEl.checked : false;
        let filtered = list.filter(c => {
            const hay = [c.company_name, c.trade_name, c.contact_name, c.city, c.state, c.country, c.carrier_type, c.status]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
            if (fType !== 'all' && (c.carrier_type || '') !== fType) return false;
            if (fCountry !== 'all' && (c.country || '') !== fCountry) return false;
            if (fStatus !== 'all' && (c.status || '') !== fStatus) return false;
            if (hasContactOnly && !c.has_contact) return false;
            return true;
        });
        const keyf = {
            name: c => (c.company_name || 'zzzz'),
            location: c => [c.country, c.state, c.city].filter(Boolean).join(' '),
            type: c => c.carrier_type || '',
            status: c => c.status || ''
        }[sort] || (c => c.company_name || 'zzzz');
        filtered.sort((a, b) => String(keyf(a)).localeCompare(String(keyf(b))));
        this.renderCarrierCards(filtered);
    },

    renderCarrierCards(companies) {
        const esc = this.esc;
        const container = document.getElementById('companiesList');
        container.style.display = 'block';
        if (!companies.length) {
            container.innerHTML = '<p>No carriers match your search.</p>';
            return;
        }
        container.innerHTML = companies.map(c => {
            const loc = esc([c.city, c.state, c.country].filter(Boolean).join(', '));
            const type = esc(c.carrier_type || '');
            const meta = [loc, type].filter(Boolean).join(' · ');
            if (c.status === 'pending') {
                return `
                    <div class="company-card company-card--pending">
                        <div class="company-name company-name--masked">🔒 Carrier — details hidden</div>
                        <div class="company-meta">${meta || 'International carrier'}</div>
                        <span class="company-badge company-badge--pending">Pending carrier confirmation</span>
                    </div>`;
            }
            const nameLine = esc(c.company_name) + (c.trade_name ? ` <span class="company-dba">(${esc(c.trade_name)})</span>` : '');
            const contact = [esc(c.contact_name), esc(c.qi_title)].filter(Boolean).join(', ');
            const details = [
                contact ? `Contact: ${contact}` : '',
                c.phone ? `Phone: ${esc(c.phone)}` : '',
                c.license_number ? `FMC license: ${esc(c.license_number)}` : '',
                c.renewal_date ? `Registration renews: ${esc(c.renewal_date)}` : ''
            ].filter(Boolean).map(d => `<div class="company-detail">${d}</div>`).join('');
            return `
                <div class="company-card">
                    <div class="company-name">${nameLine}</div>
                    <div class="company-meta">${meta}</div>
                    ${details}
                    <span class="company-badge company-badge--verified">Confirmed by carrier</span>
                </div>`;
        }).join('');
    },

    buyShipperAccess() {
        alert('Stripe integration coming soon. This would charge $10/month for carrier directory access.');
        // TODO: Integrate Stripe checkout
    },

    renewCompanySubscription() {
        alert('Stripe integration coming soon. This would charge $50/month.');
        // TODO: Integrate Stripe subscription
    },

    openInquiryForm(shipmentId) {
        const message = prompt('Enter your inquiry message:');
        if (!message) return;

        this.submitInquiry(shipmentId, message);
    },

    async submitInquiry(shipmentId, message) {
        try {
            const res = await fetch(`${this.apiUrl}/api/inquiries`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ shipment_id: shipmentId, message })
            });

            if (!res.ok) {
                alert('Failed to submit inquiry');
                return;
            }

            alert('Inquiry submitted! Shipper will be notified.');
            this.loadCompanyDashboard();
        } catch (err) {
            console.error('Failed to submit inquiry:', err);
            alert('Error submitting inquiry');
        }
    },

    async loadShipperInquiries() {
        try {
            const res = await fetch(`${this.apiUrl}/api/inquiries`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!res.ok) return;

            const data = await res.json();
            this.renderShipperInquiries(data.inquiries || []);
        } catch (err) {
            console.error('Failed to load inquiries:', err);
        }
    },

    renderShipperInquiries(inquiries) {
        const body = document.getElementById('shipperInquiriesBody');
        if (!inquiries.length) {
            body.innerHTML = '<tr><td colspan="5">No inquiries yet.</td></tr>';
            return;
        }
        const esc = this.esc;
        body.innerHTML = inquiries.map(i => {
            const disp = i.created_at ? new Date(i.created_at).toLocaleString() : '—';
            return `<tr data-status="${esc(i.status || '')}">
                <td>${esc(i.origin)} → ${esc(i.destination)}</td>
                <td>${esc(i.company_name)}</td>
                <td>${esc(i.message) || 'No message'}</td>
                <td>${esc(i.status) || '—'}</td>
                <td data-sort="${esc(i.created_at || '')}">${esc(disp)}</td>
            </tr>`;
        }).join('');
    },

    async loadCompanyInquiries() {
        try {
            const res = await fetch(`${this.apiUrl}/api/inquiries`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!res.ok) return;

            const data = await res.json();
            this.renderCompanyInquiries(data.inquiries || []);
        } catch (err) {
            console.error('Failed to load inquiries:', err);
        }
    },

    renderCompanyInquiries(inquiries) {
        const body = document.getElementById('companyInquiriesBody');
        if (!inquiries.length) {
            body.innerHTML = '<tr><td colspan="4">No inquiries sent yet.</td></tr>';
            return;
        }
        const esc = this.esc;
        body.innerHTML = inquiries.map(i => {
            const disp = i.created_at ? new Date(i.created_at).toLocaleString() : '—';
            return `<tr>
                <td>${esc(i.origin)} → ${esc(i.destination)}</td>
                <td>${esc(i.name)}</td>
                <td>${esc(i.message) || 'No message'}</td>
                <td data-sort="${esc(i.created_at || '')}">${esc(disp)}</td>
            </tr>`;
        }).join('');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
