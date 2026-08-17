// Dynamic API Base URL — routes frontend static server (e.g. Live Server port 5500 or file://) to Express backend on port 4000
const isFileProtocol = window.location.protocol === 'file:';
const isLocal = isFileProtocol
    || ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    || /^192\.168\./.test(window.location.hostname)
    || /^10\./.test(window.location.hostname);

const targetHost = (isFileProtocol || !window.location.hostname) ? 'localhost' : window.location.hostname;
const API_BASE = (isFileProtocol || (isLocal && window.location.port !== '4000'))
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

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}
