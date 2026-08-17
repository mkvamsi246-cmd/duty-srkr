function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return 'Good Morning Sir';
    } else if (hour >= 12 && hour < 17) {
        return 'Good Afternoon Sir';
    } else {
        return 'Good Evening Sir';
    }
}

async function renderDashboard(container) {
    const [faculty, groups] = await Promise.all([
        api.get('/faculty'),
        api.get('/exams/grouped'),
    ]);

    const activeFaculty = faculty.filter((f) => f.is_active);
    const totalDuties = faculty.reduce((sum, f) => sum + f.duty_count, 0);
    const upcoming = groups.slice(0, 6);
    const greeting = getGreeting();
    const activeUser = window.currentUsername ? ` ${window.currentUsername.replace(/-srkr$/i, '').toUpperCase()}` : '';

    container.innerHTML = `
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
            <div>
                <h3 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.01em;">
                    ${greeting},${escapeHtml(activeUser)}
                </h3>
                <p style="margin:0;font-size:13px;color:#cbd5e1;font-weight:500;">
                    Welcome to your department invigilation management workspace.
                </p>
            </div>
            <div style="font-size:12px;background:rgba(255,255,255,0.1);padding:6px 14px;border-radius:20px;color:#f1f5f9;font-weight:700;letter-spacing:0.02em;">
                📅 ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
        </div>

        <div class="stat-grid">
            <div class="stat-card"><div class="stat-value">${activeFaculty.length}</div><div class="stat-label">Active Faculty</div></div>
            <div class="stat-card"><div class="stat-value">${groups.length}</div><div class="stat-label">Exam Sessions</div></div>
            <div class="stat-card"><div class="stat-value">${totalDuties}</div><div class="stat-label">Total Duties Assigned</div></div>
        </div>

        <div class="panel">
            <h3 class="panel-title">Recent Exam Sessions</h3>
            ${upcoming.length === 0 ? '<p class="empty-state">No exam sessions yet. Add one under "Exam Sessions".</p>' : `
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Exam</th><th>Date</th><th>Session</th></tr></thead>
                    <tbody>
                        ${upcoming.map((g) => {
                            const sessNames = g.sessions.map(s => s.session);
                            const sessionText = (sessNames.includes('FN') && sessNames.includes('AN'))
                                ? 'FN & AN'
                                : sessNames.join(' & ');
                            return `
                                <tr>
                                    <td>${escapeHtml(g.examName)}</td>
                                    <td>${escapeHtml(g.examDate)}</td>
                                    <td><span style="font-weight:600;">${escapeHtml(sessionText)}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
        </div>
    `;
}
