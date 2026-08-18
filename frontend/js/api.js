// Dynamic API Base URL — routes frontend static server (e.g. Live Server port 5500 or file://) to Express backend on port 4000
const isFileProtocol = window.location.protocol === 'file:';
const isLocal = isFileProtocol
    || ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    || /^192\.168\./.test(window.location.hostname)
    || /^10\./.test(window.location.hostname);

const targetHost = (isFileProtocol || !window.location.hostname) ? 'localhost' : window.location.hostname;
const API_BASE = (window.BACKEND_URL)
    ? (window.BACKEND_URL.endsWith('/api') ? window.BACKEND_URL : `${window.BACKEND_URL.replace(/\/$/, '')}/api`)
    : (isFileProtocol || (isLocal && window.location.port !== '4000'))
    ? `http://${targetHost}:4000/api`
    : '/api';

// In-memory response cache for GET requests to eliminate latency on tab switching
const apiCache = new Map();
const DEFAULT_CACHE_TTL = 60 * 1000; // 60 seconds

function clearApiCache() {
    apiCache.clear();
}

function getCleanPath(path) {
    if (!path) return '';
    return path.startsWith('/api/') ? path.slice(4) : path;
}

async function apiRequest(path, options = {}) {
    const cleanPath = getCleanPath(path);
    const isGet = !options.method || options.method === 'GET';
    const bypassCache = options.bypassCache || false;

    if (isGet && !bypassCache && apiCache.has(cleanPath)) {
        const cached = apiCache.get(cleanPath);
        if (Date.now() - cached.timestamp < DEFAULT_CACHE_TTL) {
            return cached.data;
        }
    }

    const res = await fetch(API_BASE + cleanPath, {
        credentials: 'include',
        headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        ...options,
    });

    if (res.status === 401) {
        clearApiCache();
        showApp(false);
        throw new Error('Session expired. Please log in again.');
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body (e.g. file downloads) */ }

    if (!res.ok) {
        throw new Error((data && data.error) || `Request failed (${res.status})`);
    }

    if (isGet && !bypassCache) {
        apiCache.set(cleanPath, { data, timestamp: Date.now() });
    } else if (!isGet) {
        clearApiCache();
    }

    return data;
}

async function downloadFile(path, filename) {
    const cleanPath = getCleanPath(path);
    const res = await fetch(API_BASE + cleanPath, { credentials: 'include' });
    if (res.status === 401) {
        clearApiCache();
        showApp(false);
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        let errMsg = `Download failed (${res.status})`;
        try {
            const data = await res.json();
            if (data && data.error) errMsg = data.error;
        } catch (e) {}
        throw new Error(errMsg);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

const api = {
    get:        (path, opts) => apiRequest(path, { ...opts, method: 'GET' }),
    post:       (path, body) => apiRequest(path, { method: 'POST',   body: JSON.stringify(body) }),
    put:        (path, body) => apiRequest(path, { method: 'PUT',    body: JSON.stringify(body) }),
    patch:      (path, body) => apiRequest(path, { method: 'PATCH',  body: JSON.stringify(body) }),
    del:        (path)       => apiRequest(path, { method: 'DELETE' }),
    upload:     (path, formData) => apiRequest(path, { method: 'POST', body: formData }),
    download:   downloadFile,
    clearCache: clearApiCache,
    getCached:  (path)       => apiCache.has(path) ? apiCache.get(path).data : null,
};

function playBellSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const playTone = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.35, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playTone(880, now, 0.5);          // A5 bell note
        playTone(1318.51, now + 0.08, 0.7); // E6 harmonic bell chime
    } catch (e) {
        console.warn('Audio bell play failed:', e);
    }
}

function showFloatingWarningModal(message, title = 'Faculty Shortage Warning Alert') {
    playBellSound();

    let modalOverlay = document.getElementById('warning-modal-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'warning-modal-overlay';
        modalOverlay.className = 'warning-modal-overlay';
        document.body.appendChild(modalOverlay);
    }

    const safeTitle = String(title || 'Faculty Shortage Warning Alert').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeMsg   = String(message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    modalOverlay.innerHTML = `
        <div class="warning-modal-card">
            <div class="warning-modal-header">
                <div class="warning-modal-title-wrap">
                    <span class="warning-modal-bell-icon">🔔</span>
                    <h3 class="warning-modal-title">${safeTitle}</h3>
                </div>
                <button type="button" class="warning-modal-close-btn" id="warning-modal-close-x">&times;</button>
            </div>
            <div class="warning-modal-body">
                <div class="warning-modal-alert-box">
                    <span class="warning-alert-icon">⚠️</span>
                    <div class="warning-modal-message">${safeMsg}</div>
                </div>
            </div>
            <div class="warning-modal-footer">
                <button type="button" class="btn btn-primary warning-modal-ok-btn" id="warning-modal-ok-btn">OK, Understood</button>
            </div>
        </div>
    `;

    modalOverlay.classList.add('active');

    const closeModal = () => {
        modalOverlay.classList.remove('active');
    };

    document.getElementById('warning-modal-close-x').onclick = closeModal;
    document.getElementById('warning-modal-ok-btn').onclick = closeModal;
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) closeModal();
    };
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);

    // If message is a warning/error or contains shortfall/shortage, pop up floating warning window + bell sound
    if (isError || (message && /warning|shortfall|shortage|issue|error/i.test(message))) {
        showFloatingWarningModal(message, isError ? 'Faculty Shortage Warning Alert' : 'Faculty Shortage Warning Alert');
    }
}
