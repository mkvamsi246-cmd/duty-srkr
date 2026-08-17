const views = {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    faculty: { title: 'Faculty', render: renderFaculty },
    exams: { title: 'Exam Sessions', render: renderExams },
    generate: { title: 'Generate Duties', render: renderGenerate },
    dutysheet: { title: 'Duty Sheet Export', render: renderDutySheet },
    import: { title: 'Import Data', render: renderImport },
    settings: { title: 'Settings', render: renderSettings },
};

let currentView = 'dashboard';

function formatDeptName(name) {
    if (!name) return '';
    return name.replace(/-srkr$/i, '').toUpperCase();
}

function showApp(loggedIn, username, resetToDashboard = false) {
    document.getElementById('login-screen').classList.toggle('hidden', loggedIn);
    document.getElementById('app-shell').classList.toggle('hidden', !loggedIn);
    if (loggedIn) {
        if (username) {
            window.currentUsername = username;
            const deptDisplay = formatDeptName(username);
            const badgeText = document.getElementById('user-dept-text');
            if (badgeText) badgeText.textContent = `Welcome Sir, ${deptDisplay}`;
        }
        if (resetToDashboard) {
            navigateTo('dashboard');
        } else {
            navigateTo(currentView);
        }
    }
}

async function navigateTo(viewName) {
    const view = views[viewName];
    if (!view) return;
    currentView = viewName;

    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.getElementById('view-title').textContent = view.title;

    const container = document.getElementById('view-container');
    
    // Only show loading placeholder if container is empty or if render takes time
    let isInstant = true;
    const loadingTimer = setTimeout(() => {
        isInstant = false;
        container.innerHTML = '<p class="empty-state">Loading…</p>';
    }, 50);

    try {
        await view.render(container);
        clearTimeout(loadingTimer);
    } catch (err) {
        clearTimeout(loadingTimer);
        container.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function formatDesignation(d) {
    if (!d) return '';
    return d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', () => {
    // Password view toggle handler
    const passwordInput = document.getElementById('login-password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const eyeIcon = document.getElementById('eye-icon');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            eyeIcon.innerHTML = isPassword
                ? `<path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.04 10.04 0 013.122-.463c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m-2.585-2.585a3 3 0 11-4.243-4.243"/><path d="M3 3l18 18"/>`
                : `<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
        });
    }

    const loginForm = document.getElementById('login-form');
    const submitBtn = document.getElementById('login-submit-btn');
    const statusEl  = document.getElementById('login-status');
    const errEl     = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        errEl.textContent = '';
        if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        // Timer to notify user if free-tier server is warming up
        const warmUpTimer = setTimeout(() => {
            if (statusEl) {
                statusEl.textContent = '⚡ Waking up backend server from free-tier sleep mode (takes ~15-30s)...';
                statusEl.classList.remove('hidden');
            }
        }, 1200);

        try {
            const res = await api.post('/auth/login', { username, password });
            clearTimeout(warmUpTimer);
            showApp(true, res.username || username, true);
        } catch (err) {
            clearTimeout(warmUpTimer);
            errEl.textContent = err.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            if (statusEl) statusEl.classList.add('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await api.post('/auth/logout', {});
        showApp(false);
    });

    // Mobile Navigation Drawer Handlers
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuBtn = document.getElementById('mobile-menu-toggle');
    const closeBtn = document.getElementById('mobile-sidebar-close');

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
    }

    function openMobileSidebar() {
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.remove('hidden');
    }

    if (menuBtn) menuBtn.addEventListener('click', openMobileSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);

    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeMobileSidebar();
            navigateTo(btn.dataset.view);
        });
    });

    // Check auth status
    api.get('/auth/status')
        .then((res) => showApp(res.authenticated, res.username))
        .catch(() => showApp(false));
});
