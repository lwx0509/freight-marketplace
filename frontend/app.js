/**
 * Freight Marketplace Frontend
 * Vanilla JavaScript SPA
 */

const app = {
    apiUrl: '',
    user: null,
    token: null,

    init() {
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
                document.getElementById('claimDoneMsg').textContent = 'Thanks — your company is now listed on FreightLink. You can request removal at any time by contacting us.';
            } else {
                document.getElementById('claimDoneTitle').textContent = 'Your information has been removed';
                document.getElementById('claimDoneMsg').textContent = 'Your company will not be listed on FreightLink.';
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
            body.innerHTML = '<tr><td colspan="7">No carriers imported yet.</td></tr>';
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
            const lanes = esc([c.lanes, c.country].filter(Boolean).join(' · ')) || '—';
            const linkCell = link
                ? `<button class="btn-link btn-sm" onclick="app.copyText('${link.replace(/'/g, "\\'")}', this)">Copy</button>`
                : '—';
            return `<tr>
                <td>${esc(c.company_name)}</td>
                <td>${esc(c.contact_name) || '—'}</td>
                <td>${esc(c.email) || '—'}</td>
                <td>${lanes}</td>
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

    renderShipments(shipments) {
        const container = document.getElementById('shipmentsList');

        if (shipments.length === 0) {
            container.innerHTML = '<p>No shipments posted yet.</p>';
            return;
        }

        container.innerHTML = shipments.map(s => `
            <div class="shipment-card">
                <h4>${s.origin} → ${s.destination}</h4>
                <p><strong>Cargo:</strong> ${s.cargo_type}</p>
                <p><strong>Weight:</strong> ${s.weight_tons || 'N/A'} tons</p>
                <p><strong>Budget:</strong> $${s.budget || 'N/A'}</p>
                <p><strong>Shipping Date:</strong> ${s.shipping_date || 'TBD'}</p>
                ${s.notes ? `<p><strong>Notes:</strong> ${s.notes}</p>` : ''}
                <p style="color: #0066cc;"><strong>Status:</strong> ${s.status}</p>
            </div>
        `).join('');
    },

    renderAvailableShipments(shipments) {
        const container = document.getElementById('availableShipmentsList');

        if (shipments.length === 0) {
            container.innerHTML = '<p>No shipments available at this time.</p>';
            return;
        }

        container.innerHTML = shipments.map(s => `
            <div class="shipment-card">
                <h4>${s.origin} → ${s.destination}</h4>
                <p><strong>Cargo:</strong> ${s.cargo_type}</p>
                <p><strong>Weight:</strong> ${s.weight_tons || 'N/A'} tons</p>
                <p><strong>Budget:</strong> $${s.budget || 'N/A'}</p>
                <p><strong>Shipping Date:</strong> ${s.shipping_date || 'TBD'}</p>
                ${s.notes ? `<p><strong>Notes:</strong> ${s.notes}</p>` : ''}
                <div class="card-actions">
                    <button class="btn-primary" onclick="app.openInquiryForm(${s.id})">Inquire</button>
                </div>
            </div>
        `).join('');
    },

    async handleCreateShipment(event) {
        event.preventDefault();

        const dateVal = document.getElementById('shipmentDate').value;
        if (dateVal) {
            const today = new Date().toISOString().slice(0, 10);
            if (dateVal < today) {
                alert('Shipping date cannot be in the past');
                return;
            }
        }

        const payload = {
            origin: document.getElementById('shipmentOriginCity').value.trim() + ', ' + document.getElementById('shipmentOriginState').value.trim(),
            destination: document.getElementById('shipmentDestCity').value.trim() + ', ' + document.getElementById('shipmentDestState').value.trim(),
            cargo_type: document.getElementById('shipmentCargoType').value,
            weight_tons: parseFloat(document.getElementById('shipmentWeight').value) || null,
            budget: parseFloat(document.getElementById('shipmentBudget').value) || null,
            shipping_date: document.getElementById('shipmentDate').value,
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
        // TODO: Check if shipper has valid access
        // For now, show buy button
        document.getElementById('buyAccessBtn').style.display = 'block';
        document.getElementById('companiesList').style.display = 'none';
        document.getElementById('accessStatus').textContent = 'You need access to browse carriers.';

        // TODO: Load companies list if they have access
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
            document.getElementById('buyAccessBtn').style.display = 'none';
            document.getElementById('accessStatus').textContent = 'Browse available carriers:';
            return;
        }

        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
        ));

        container.innerHTML = companies.map(c => {
            const meta = esc([c.lanes, c.country].filter(Boolean).join(' · '));
            if (c.status === 'pending') {
                return `
                    <div class="company-card company-card--pending">
                        <div class="company-name company-name--masked">🔒 Carrier — details hidden</div>
                        <div class="company-meta">${meta || 'International lanes'}</div>
                        <span class="company-badge company-badge--pending">Pending carrier confirmation</span>
                    </div>`;
            }
            return `
                <div class="company-card">
                    <div class="company-name">${esc(c.company_name)}</div>
                    <div class="company-meta">${meta}</div>
                    <span class="company-badge company-badge--verified">Confirmed by carrier</span>
                </div>`;
        }).join('');

        container.style.display = 'block';
        document.getElementById('buyAccessBtn').style.display = 'none';
        document.getElementById('accessStatus').textContent = 'Browse available carriers:';
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
        const container = document.getElementById('shipperInquiriesList');

        if (inquiries.length === 0) {
            container.innerHTML = '<p>No inquiries yet.</p>';
            return;
        }

        container.innerHTML = inquiries.map(i => `
            <div class="inquiry-card">
                <h4>${i.origin} → ${i.destination}</h4>
                <p><strong>From:</strong> ${i.company_name}</p>
                <p><strong>Message:</strong> ${i.message || 'No message'}</p>
                <p style="color: #666; font-size: 12px;">Received: ${new Date(i.created_at).toLocaleString()}</p>
            </div>
        `).join('');
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
        const container = document.getElementById('companyInquiriesList');

        if (inquiries.length === 0) {
            container.innerHTML = '<p>No inquiries sent yet.</p>';
            return;
        }

        container.innerHTML = inquiries.map(i => `
            <div class="inquiry-card">
                <h4>${i.origin} → ${i.destination}</h4>
                <p><strong>Shipper:</strong> ${i.name}</p>
                <p><strong>Your Message:</strong> ${i.message || 'No message'}</p>
                <p style="color: #666; font-size: 12px;">Sent: ${new Date(i.created_at).toLocaleString()}</p>
            </div>
        `).join('');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
