async function renderExams(container) {
    const groups = await api.get('/exams/grouped');

    container.innerHTML = `
        <div class="panel">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <h3 class="panel-title" style="margin:0;">Add Exam Session</h3>
                <div style="display:flex;align-items:center;gap:8px;">
                    <a href="/api/templates/exam_sessions" download class="btn btn-sm" style="font-size:12px;">Download Sample Excel</a>
                    <label class="btn btn-sm btn-primary" style="margin:0;cursor:pointer;font-size:12px;background:var(--primary-color);">
                        📁 Import Excel
                        <input type="file" id="exam-import-input" accept=".xlsx,.xls" style="display:none;">
                    </label>
                </div>
            </div>
            <form id="exam-form" class="row">
                <div class="field">
                    <label class="field-label">Exam Name</label>
                    <select class="input" name="exam_name" required>
                        <option value="MID-1">MID-1</option>
                        <option value="Mid-2">Mid-2</option>
                        <option value="Sem-1">Sem-1</option>
                        <option value="Sem-2">Sem-2</option>
                    </select>
                </div>
                <div class="field"><label class="field-label">Date</label><input class="input" name="exam_date" type="date" required></div>
                <div class="field">
                    <label class="field-label">Session</label>
                    <select class="input" name="session" id="session-select-form">
                        <option value="BOTH">Both (FN &amp; AN)</option>
                        <option value="FN">Forenoon only (FN)</option>
                        <option value="AN">Afternoon only (AN)</option>
                    </select>
                </div>
                <div class="field" style="max-width:110px;">
                    <label class="field-label">Year / Sem <span style="font-size:10px;color:#dc2626;">*</span></label>
                    <select class="input" name="year_sem" required>
                        <option value="">- select -</option>
                        <option value="1-1">1-1</option>
                        <option value="1-2">1-2</option>
                        <option value="2-1">2-1</option>
                        <option value="2-2">2-2</option>
                        <option value="3-1">3-1</option>
                        <option value="3-2">3-2</option>
                        <option value="4-1">4-1</option>
                        <option value="4-2">4-2</option>
                    </select>
                </div>
                <div class="field" style="max-width:130px;">
                    <label class="field-label">Invigilators <span style="font-size:10px;color:var(--gray-500);">(optional)</span></label>
                    <input class="input" name="required_invigilators" type="number" min="1" placeholder="e.g. 20">
                </div>
                <div class="field" style="max-width:130px;">
                    <label class="field-label">Start Time <span style="font-size:10px;color:var(--gray-500);">(optional)</span></label>
                    <input class="input" name="start_time" type="time" placeholder="09:30">
                </div>
                <div class="field" style="max-width:130px;">
                    <label class="field-label">End Time <span style="font-size:10px;color:var(--gray-500);">(optional)</span></label>
                    <input class="input" name="end_time" type="time" placeholder="12:30">
                </div>
                <button class="btn btn-primary" type="submit">Add</button>
            </form>
        </div>

        <div class="panel">
            <h3 class="panel-title">Exam Sessions (${groups.length})</h3>
            ${groups.length === 0 ? '<p class="empty-state">No exam sessions yet.</p>' : `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Exam</th>
                            <th>Date</th>
                            <th>Session</th>
                            <th>Year/Sem</th>
                            <th>Invigilators</th>
                            <th>Time</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map((g) => {
                            const sessNames = g.sessions.map(s => s.session);
                            const sessionText = (sessNames.includes('FN') && sessNames.includes('AN'))
                                ? 'FN & AN'
                                : sessNames.join(' & ');
                            const idsStr = g.sessions.map(s => s.id).join(',');
                            const firstSess = g.sessions[0] || {};
                            return `
                            <tr>
                                <td>${escapeHtml(g.examName)}</td>
                                <td>${escapeHtml(String(g.examDate).slice(0,10))}</td>
                                <td><span style="font-weight:600;">${escapeHtml(sessionText)}</span></td>
                                <td>
                                    ${g.yearSem
                                        ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${escapeHtml(g.yearSem)}</span>`
                                        : '<span style="color:var(--gray-400);font-size:11px;">-</span>'}
                                </td>
                                <td style="text-align:center;font-size:13px;">
                                    ${firstSess.requiredInvigilators != null
                                        ? `<span style="font-weight:600;">${firstSess.requiredInvigilators}</span> <span style="color:var(--gray-500);font-size:11px;">(manual)</span>`
                                        : '<span style="color:var(--gray-400);font-size:11px;">auto</span>'}
                                </td>
                                <td style="font-size:12px;color:var(--gray-500);">
                                    ${firstSess.startTime ? `${firstSess.startTime}` : '-'}
                                    ${firstSess.startTime && firstSess.endTime ? ' &rarr; ' : ''}
                                    ${firstSess.endTime ? `${firstSess.endTime}` : ''}
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-danger" data-delete-ids="${idsStr}">Delete</button>
                                </td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>
            </div>`}
        </div>
    `;

    document.getElementById('exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        if (!data.start_time) delete data.start_time;
        if (!data.end_time)   delete data.end_time;

        const selectedSession = data.session;
        const sessionsToCreate = selectedSession === 'BOTH'
            ? ['FN', 'AN']
            : [selectedSession];

        const btn = document.querySelector('#exam-form button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        try {
            for (const sess of sessionsToCreate) {
                await api.post('/exams', { ...data, session: sess });
            }
            showToast(
                sessionsToCreate.length === 2
                    ? 'Both FN & AN sessions added'
                    : 'Exam session added'
            );
            renderExams(container);
        } catch (err) {
            showToast(err.message, true);
            btn.disabled = false;
            btn.textContent = 'Add';
        }
    });

    document.getElementById('exam-import-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
            showToast('Uploading and importing exam sessions...');
            const res = await api.upload('/upload/exam_sessions', fd);
            showToast(`Imported ${res.imported} exam session(s)!`);
            renderExams(container);
        } catch (err) {
            showToast(err.message, true);
        }
    });

    container.querySelectorAll('[data-delete-ids]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this exam session and all its duty data?')) return;
            try {
                const ids = btn.dataset.deleteIds.split(',');
                for (const id of ids) {
                    await api.del(`/exams/${id}`);
                }
                showToast('Exam session deleted');
                renderExams(container);
            } catch (err) {
                showToast(err.message, true);
            }
        });
    });
}
