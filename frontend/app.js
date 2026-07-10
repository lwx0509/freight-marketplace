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

        if (this.token && this.user) {
            this.showPage('dashboardPage');
            this.loadDashboard();
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
            this.user = { id: data.user_id, email: data.email, user_type: data.user_type };

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
            this.user = { id: data.user_id, email: data.email, user_type: data.user_type };

            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.showPage('dashboardPage');
            this.loadDashboard();
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
                        <div class="company-name company-name--masked">🔒 Verified carrier</div>
                        <div class="company-meta">${meta || 'International lanes'}</div>
                        <span class="company-badge company-badge--pending">Pending verification</span>
                    </div>`;
            }
            return `
                <div class="company-card">
                    <div class="company-name">${esc(c.company_name)}</div>
                    <div class="company-meta">${meta}</div>
                    <span class="company-badge company-badge--verified">Verified</span>
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
