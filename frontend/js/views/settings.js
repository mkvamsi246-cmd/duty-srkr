async function renderSettings(container) {
    const settings = await api.get('/allocation/settings');
    const priorityOrder = settings.priorityOrder || ['assistant_professor', 'associate_professor', 'professor'];
    const sessionPeriods = settings.sessionPeriods || { FN: [1, 2, 3, 4], AN: [5, 6, 7, 8] };
    const labels = {
        assistant_professor: 'Assistant Professor',
        associate_professor: 'Associate Professor',
        professor: 'Professor',
    };

    container.innerHTML = `
        <div class="panel">
            <h3 class="panel-title">Duty Priority Order</h3>
            <p style="font-size:12.5px;color:var(--gray-600);">
                Faculty in the first tier are assigned duties before the next tier. Within the same tier,
                whoever has the fewest duties so far is picked first, so load stays balanced.
            </p>
            <ol id="priority-list" style="padding-left:20px;">
                ${priorityOrder.map((d, i) => `
                    <li style="margin:6px 0;display:flex;align-items:center;gap:8px;">
                        <span style="flex:1;">${labels[d] || d}</span>
                        <button class="btn btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                        <button class="btn btn-sm" data-move="down" data-idx="${i}" ${i === priorityOrder.length - 1 ? 'disabled' : ''}>↓</button>
                    </li>
                `).join('')}
            </ol>
        </div>

        <div class="panel">
            <h3 class="panel-title">Students per Faculty</h3>
            <div class="row">
                <div class="field">
                    <label class="field-label">Students per invigilator</label>
                    <input class="input" id="ratio-input" type="number" min="1" value="${settings.studentsPerFaculty || 24}">
                </div>
                <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
            </div>
        </div>

        <div class="panel">
            <h3 class="panel-title">Session → Period Mapping</h3>
            <p style="font-size:12.5px;color:var(--gray-600);">
                Which timetable periods each exam session overlaps. A faculty member with a class or lab
                in any of these periods that weekday is automatically excluded from duty for that session.
            </p>
            <div class="row">
                <div class="field">
                    <label class="field-label">Forenoon (FN) periods</label>
                    <input class="input" id="fn-periods" value="${(sessionPeriods.FN || []).join(', ')}" placeholder="e.g. 1, 2, 3, 4">
                </div>
                <div class="field">
                    <label class="field-label">Afternoon (AN) periods</label>
                    <input class="input" id="an-periods" value="${(sessionPeriods.AN || []).join(', ')}" placeholder="e.g. 5, 6, 7, 8">
                </div>
            </div>
        </div>

        <!-- Change Password Section -->
        <div class="panel" style="border-top:3px solid #3b82f6;">
            <h3 class="panel-title">Change Account Password</h3>
            <p style="font-size:12.5px;color:var(--gray-600);">
                Update your login password for this department account.
            </p>
            <form id="change-password-form" style="max-width:400px;margin-top:12px;">
                <div class="field" style="margin-bottom:12px;">
                    <label class="field-label">Current Password</label>
                    <input type="password" class="input" id="curr-password-input" required autocomplete="current-password">
                </div>
                <div class="field" style="margin-bottom:12px;">
                    <label class="field-label">New Password</label>
                    <input type="password" class="input" id="new-password-input" required autocomplete="new-password">
                </div>
                <div class="field" style="margin-bottom:16px;">
                    <label class="field-label">Confirm New Password</label>
                    <input type="password" class="input" id="confirm-password-input" required autocomplete="new-password">
                </div>
                <button type="submit" class="btn btn-primary" id="change-pass-btn">Update Password</button>
            </form>
        </div>

        <!-- Clear Department Data Section -->
        <div class="panel" style="border:1px solid #fca5a5;background:#fff5f5;">
            <h3 class="panel-title" style="color:#991b1b;">Clear Department Data</h3>
            <p style="font-size:12.5px;color:#7f1d1d;line-height:1.5;">
                <strong>Warning:</strong> This action will permanently erase all faculty records, weekly timetables, exam sessions, and assigned duties for your department login. This action cannot be undone.
            </p>
            <div style="margin-top:16px;">
                <button type="button" class="btn" id="clear-dept-data-btn" style="background:#ef4444;color:#fff;border:none;padding:10px 20px;font-weight:700;">
                    🗑 Clear All Data For This Login
                </button>
            </div>
        </div>
    `;

    let order = [...priorityOrder];

    function rerenderList() {
        document.getElementById('priority-list').innerHTML = order.map((d, i) => `
            <li style="margin:6px 0;display:flex;align-items:center;gap:8px;">
                <span style="flex:1;">${labels[d] || d}</span>
                <button class="btn btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn-sm" data-move="down" data-idx="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
            </li>
        `).join('');
        attachMoveHandlers();
    }

    function attachMoveHandlers() {
        container.querySelectorAll('[data-move]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.idx);
                const dir = btn.dataset.move === 'up' ? -1 : 1;
                const swapIdx = idx + dir;
                [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
                rerenderList();
            });
        });
    }
    attachMoveHandlers();

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
        const parseList = (str) => str.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
        try {
            await api.put('/allocation/settings', {
                priorityOrder: order,
                studentsPerFaculty: Number(document.getElementById('ratio-input').value),
                sessionPeriods: {
                    FN: parseList(document.getElementById('fn-periods').value),
                    AN: parseList(document.getElementById('an-periods').value),
                },
            });
            showToast('Settings saved');
        } catch (err) {
            showToast(err.message, true);
        }
    });

    // Change Password Handler
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('curr-password-input').value;
        const newPassword = document.getElementById('new-password-input').value;
        const confirmPassword = document.getElementById('confirm-password-input').value;

        if (newPassword !== confirmPassword) {
            showToast('New password and confirm password do not match', true);
            return;
        }

        const passBtn = document.getElementById('change-pass-btn');
        passBtn.disabled = true;
        passBtn.textContent = 'Updating...';

        try {
            await api.post('/auth/change-password', { currentPassword, newPassword });
            showToast('Password changed successfully!');
            document.getElementById('change-password-form').reset();
        } catch (err) {
            showToast(err.message, true);
        } finally {
            passBtn.disabled = false;
            passBtn.textContent = 'Update Password';
        }
    });

    // Clear Data Handler
    document.getElementById('clear-dept-data-btn').addEventListener('click', async () => {
        if (!confirm('Are you ABSOLUTELY sure you want to clear ALL data for this department login? This will delete all faculty, timetables, exam sessions, and duty sheets!')) {
            return;
        }

        const clearBtn = document.getElementById('clear-dept-data-btn');
        clearBtn.disabled = true;
        clearBtn.textContent = 'Clearing Data...';

        try {
            const res = await api.post('/settings/clear-data', {});
            showToast(res.message || 'All department data cleared!');
            setTimeout(() => {
                navigateTo('dashboard');
            }, 800);
        } catch (err) {
            showToast(err.message, true);
        } finally {
            clearBtn.disabled = false;
            clearBtn.textContent = '🗑 Clear All Data For This Login';
        }
    });
}
