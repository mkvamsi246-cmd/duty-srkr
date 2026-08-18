/**
 * Generate Duties — Session-Level (Room-Free) View
 * -------------------------------------------------
 * No room allocation needed. The coordinator:
 *  1. Picks an exam (grouped by name + date).
 *  2. Checks FN, AN, or both.
 *  3. Optionally enters the number of invigilators needed.
 *  4. Clicks "Generate Draft" to preview eligible faculty.
 *  5. Clicks "Finalize & Save" to commit.
 *
 * Results are shown per session (FN / AN) instead of per room.
 */

async function renderGenerate(container) {
    let groups = [];
    try {
        groups = await api.get('/exams/grouped');
    } catch (e) {
        container.innerHTML = `<div class="panel"><p class="empty-state">Could not load exam sessions: ${escapeHtml(e.message)}</p></div>`;
        return;
    }

    container.innerHTML = `
        <div class="panel">
            <h3 class="panel-title">Generate Invigilation Duties</h3>

            ${groups.length === 0
                ? '<p class="empty-state">No exam sessions found. Add sessions in the <strong>Exam Sessions</strong> tab first.</p>'
                : `
            <div class="row" style="align-items:flex-end;gap:16px;flex-wrap:wrap;">

                <!-- Exam picker -->                <div class="field" style="min-width:280px;">
                    <label class="field-label">Exam</label>
                    <select class="input" id="exam-group-select">
                        <option value="">- select exam -</option>
                        <option value="ALL">-- All Exams --</option>
                        ${groups.map((g, i) => `
                            <option value="${i}">
                                ${escapeHtml(g.examName)} - ${escapeHtml(g.examDate)}
                                ${g.course ? '[' + escapeHtml(g.course) + ']' : ''}
                                ${g.yearSem ? '[' + escapeHtml(g.yearSem) + ']' : ''}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <!-- Session checkboxes and counts -->
                <div id="session-checks" style="display:none;">
                    <label class="field-label">Session(s)</label>
                    <div style="display:flex;gap:14px;margin-top:4px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" id="chk-fn" value="FN" style="width:16px;height:16px;">
                            Forenoon (FN)
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" id="chk-an" value="AN" style="width:16px;height:16px;">
                            Afternoon (AN)
                        </label>
                    </div>
                </div>

                <!-- Per-session Invigilators Count Inputs -->
                <div id="fn-count-field" class="field" style="display:none;max-width:140px;">
                    <label class="field-label" for="ri-input-fn">FN Invigilators</label>
                    <input class="input" id="ri-input-fn" type="number" min="1" placeholder="auto">
                </div>
                <div id="an-count-field" class="field" style="display:none;max-width:140px;">
                    <label class="field-label" for="ri-input-an">AN Invigilators</label>
                    <input class="input" id="ri-input-an" type="number" min="1" placeholder="auto">
                </div>

                <button class="btn btn-primary" id="generate-btn" disabled style="align-self:flex-end;">
                    Generate Draft
                </button>
            </div>

            <!-- Export buttons -->
            <div id="export-row" style="display:none;margin-top:10px;gap:8px;">
                <a class="btn btn-sm" id="export-excel-btn">Export Excel</a>
                <a class="btn btn-sm" id="export-pdf-btn">Export PDF</a>
            </div>

            <p style="font-size:12px;color:var(--gray-500);margin-top:10px;">
                <strong>Step 1</strong> &ndash; Pick an exam, select FN/AN, click <em>Generate Draft</em> (nothing saved yet).<br>
                <strong>Step 2</strong> &ndash; Review the proposed list, then click <em>Finalize &amp; Save</em> to commit duties.
            </p>`}
        </div>

        <div id="duty-result"></div>
    `;

    if (groups.length === 0) return;

    const groupSelect   = document.getElementById('exam-group-select');
    const sessionChecks = document.getElementById('session-checks');
    const chkFN         = document.getElementById('chk-fn');
    const chkAN         = document.getElementById('chk-an');
    const fnCountField  = document.getElementById('fn-count-field');
    const anCountField  = document.getElementById('an-count-field');
    const riInputFN     = document.getElementById('ri-input-fn');
    const riInputAN     = document.getElementById('ri-input-an');
    const generateBtn   = document.getElementById('generate-btn');
    const exportRow     = document.getElementById('export-row');
    const resultEl      = document.getElementById('duty-result');

    let currentGroupIdx = null;
    let currentSessionIds = [];

    groupSelect.addEventListener('change', () => {
        const idx = groupSelect.value;
        if (idx === '') {
            sessionChecks.style.display = 'none';
            fnCountField.style.display  = 'none';
            anCountField.style.display  = 'none';
            generateBtn.disabled = true;
            resultEl.innerHTML = '';
            exportRow.style.display = 'none';
            currentGroupIdx = null;
            return;
        }

        if (idx === 'ALL') {
            currentGroupIdx = 'ALL';
            const allSessionIds = groups.flatMap(g => g.sessions.map(s => s.id));
            chkFN.disabled = false;
            chkAN.disabled = false;
            chkFN.checked = true;
            chkAN.checked = true;
            riInputFN.value = '';
            riInputAN.value = '';
            sessionChecks.style.display = 'block';
            updateVisibilityAndBtn();
            loadSavedDutyChart(allSessionIds);
            return;
        }

        currentGroupIdx = parseInt(idx, 10);
        const group = groups[currentGroupIdx];

        const fnSess = group.sessions.find(s => s.session === 'FN');
        const anSess = group.sessions.find(s => s.session === 'AN');

        chkFN.disabled = !fnSess;
        chkAN.disabled = !anSess;

        chkFN.checked = !!fnSess;
        chkAN.checked = !!anSess;

        riInputFN.value = (fnSess && fnSess.requiredInvigilators != null) ? fnSess.requiredInvigilators : '';
        riInputAN.value = (anSess && anSess.requiredInvigilators != null) ? anSess.requiredInvigilators : '';

        sessionChecks.style.display = 'block';
        updateVisibilityAndBtn();

        loadSavedDutyChart(group.sessions.map(s => s.id));
    });

    chkFN.addEventListener('change', updateVisibilityAndBtn);
    chkAN.addEventListener('change', updateVisibilityAndBtn);

    function updateVisibilityAndBtn() {
        fnCountField.style.display = chkFN.checked ? 'block' : 'none';
        anCountField.style.display = chkAN.checked ? 'block' : 'none';
        generateBtn.disabled = !(chkFN.checked || chkAN.checked);
    }

    function getSelectedSessionIds() {
        if (currentGroupIdx === null) return [];
        if (currentGroupIdx === 'ALL') {
            const selected = [];
            groups.forEach(g => {
                if (chkFN.checked) {
                    const s = g.sessions.find(s => s.session === 'FN');
                    if (s) selected.push(s.id);
                }
                if (chkAN.checked) {
                    const s = g.sessions.find(s => s.session === 'AN');
                    if (s) selected.push(s.id);
                }
            });
            return selected;
        }
        const group = groups[currentGroupIdx];
        const selected = [];
        if (chkFN.checked) {
            const s = group.sessions.find(s => s.session === 'FN');
            if (s) selected.push(s.id);
        }
        if (chkAN.checked) {
            const s = group.sessions.find(s => s.session === 'AN');
            if (s) selected.push(s.id);
        }
        return selected;
    }

    function getSessionCountsPayload() {
        if (currentGroupIdx === null) return {};
        const counts = {};
        const targetGroups = (currentGroupIdx === 'ALL') ? groups : [groups[currentGroupIdx]];
        targetGroups.forEach(g => {
            if (chkFN.checked) {
                const s = g.sessions.find(s => s.session === 'FN');
                const val = riInputFN.value.trim();
                if (s) {
                    if (val) counts[s.id] = parseInt(val, 10);
                    else if (s.requiredInvigilators) counts[s.id] = s.requiredInvigilators;
                }
            }
            if (chkAN.checked) {
                const s = g.sessions.find(s => s.session === 'AN');
                const val = riInputAN.value.trim();
                if (s) {
                    if (val) counts[s.id] = parseInt(val, 10);
                    else if (s.requiredInvigilators) counts[s.id] = s.requiredInvigilators;
                }
            }
        });
        return counts;
    }

    // STEP 1: Generate Draft
    generateBtn.addEventListener('click', async () => {
        const sessionIds = getSelectedSessionIds();
        if (sessionIds.length === 0) return;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        resultEl.innerHTML = '<p class="empty-state">Computing eligible faculty...</p>';

        try {
            const sessionCounts = getSessionCountsPayload();
            const body = {
                sessionIds,
                ...(Object.keys(sessionCounts).length > 0 ? { sessionCounts } : {}),
            };
            const preview = await api.post('/allocation/session-preview', body);
            currentSessionIds = sessionIds;
            showPreviewChart(preview, sessionIds);
        } catch (err) {
            showToast(err.message, true);
            resultEl.innerHTML = '';
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Draft';
        }
    });

    // Preview chart
    function showPreviewChart(preview, sessionIds) {
        const shortfalls = preview.filter(p => p.shortfall > 0);
        if (shortfalls.length > 0) {
            const warningMsg = `Warning: Faculty Shortage in ${shortfalls.map(s => `${s.session} (needed ${s.requestedCount}, only ${s.totalEligible} eligible)`).join(' | ')}`;
            showFloatingWarningModal(warningMsg, 'Faculty Shortage Warning Alert');
        }

        const sectionsHtml = preview.map(p => {
            const sessionColor = p.session === 'FN' ? '#2563eb' : '#d97706';
            const sessionBg    = p.session === 'FN' ? '#eff6ff' : '#fffbeb';

            const shortfallBadge = p.shortfall > 0
                ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;font-size:11px;padding:2px 8px;border-radius:4px;margin-left:8px;">
                       Warning: Faculty Shortage of ${p.shortfall} (only ${p.totalEligible} eligible)
                   </span>` : '';

            const rows = p.assignees.map((a, i) => {
                const shortcutBadge = a.shortcuts
                    ? `<span style="background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:5px;white-space:nowrap;">${escapeHtml(a.shortcuts)}</span>`
                    : '';
                return `<tr>
                    <td style="text-align:center;color:var(--gray-500);">${i + 1}</td>
                    <td>${shortcutBadge}${escapeHtml(a.name)}</td>
                    <td>${formatDesignation(a.designation)}</td>
                    <td style="color:var(--gray-500);font-size:12px;">${a.currentDutyCount} duties so far</td>
                </tr>`;
            }).join('');

            return `
                <div style="border:2px solid ${sessionColor};border-radius:10px;margin-bottom:16px;overflow:hidden;">
                    <div style="background:${sessionBg};padding:10px 16px;display:flex;align-items:center;gap:10px;">
                        <span style="background:${sessionColor};color:#fff;font-weight:700;font-size:12px;padding:3px 12px;border-radius:20px;">${p.session}</span>
                        <span style="font-weight:600;">${escapeHtml(p.examName)} - ${escapeHtml(p.examDate)}</span>
                        ${p.course ? `<span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${escapeHtml(p.course)}</span>` : ''}
                        ${p.yearSem ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${escapeHtml(p.yearSem)}</span>` : ''}
                        <span style="font-size:12px;color:var(--gray-600);margin-left:auto;">
                            ${p.assignees.length} of ${p.requestedCount} invigilators
                        </span>
                        ${shortfallBadge}
                    </div>
                    ${p.assignees.length === 0
                        ? '<p class="empty-state" style="margin:16px;">No eligible faculty available for this slot.</p>'
                        : `<div class="table-wrap">
                            <table>
                                <thead><tr>
                                    <th style="width:40px;">#</th>
                                    <th>Faculty Name</th>
                                    <th>Designation</th>
                                    <th>Current Duties</th>
                                </tr></thead>
                                <tbody>${rows}</tbody>
                            </table>
                           </div>`}
                </div>`;
        }).join('');

        resultEl.innerHTML = `
            <div class="panel" style="border:2px solid #2563eb;border-radius:10px;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                    <h3 class="panel-title" style="margin:0;">
                        Draft Duty List
                        <span style="background:#f59e0b;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:4px;margin-left:8px;vertical-align:middle;">PREVIEW</span>
                    </h3>
                    <button class="btn btn-primary" id="finalize-btn">Finalize &amp; Save</button>
                </div>
                ${sectionsHtml}
            </div>`;

        document.getElementById('finalize-btn').addEventListener('click', async () => {
            const btn = document.getElementById('finalize-btn');
            btn.disabled = true;
            btn.textContent = 'Saving...';
            try {
                const sessionCounts = getSessionCountsPayload();
                const body = {
                    sessionIds: currentSessionIds,
                    ...(Object.keys(sessionCounts).length > 0 ? { sessionCounts } : {}),
                };
                const results = await api.post('/allocation/session-generate', body);
                const total = results.reduce((s, r) => s + r.totalAssigned, 0);
                showToast(`Finalized! ${total} duties saved across ${results.length} session(s).`);
                const shortfalls = results.filter(r => r.shortfall > 0);
                if (shortfalls.length > 0) {
                    showToast(`Warning: Faculty Shortage in ${shortfalls.map(r => r.session + ': needed ' + r.requestedCount + ', got ' + r.totalAssigned).join(' | ')}`, true);
                }
                loadSavedDutyChart(currentSessionIds);
            } catch (err) {
                showToast(err.message, true);
                btn.disabled = false;
                btn.textContent = 'Finalize & Save';
            }
        });
    }

    async function loadSavedDutyChart(sessionIds) {
        if (!sessionIds || sessionIds.length === 0) return;
        try {
            const duties = await api.get(`/allocation/session-duties?sessionIds=${sessionIds.join(',')}`);
            if (duties.length === 0) {
                resultEl.innerHTML = '';
                exportRow.style.display = 'none';
                return;
            }
            showSavedChart(duties, sessionIds);
        } catch (e) {
            resultEl.innerHTML = '';
            exportRow.style.display = 'none';
        }
    }

    function showSavedChart(duties, sessionIds) {
        const bySession = new Map();
        for (const d of duties) {
            if (!bySession.has(d.session)) bySession.set(d.session, []);
            bySession.get(d.session).push(d);
        }

        const firstSessionId = sessionIds[0];
        api.get(`/allocation/available/${firstSessionId}`).then(availFaculty => {
            const sectionsHtml = [...bySession.entries()].map(([sess, rows]) => {
                const sessionColor = sess === 'FN' ? '#22c55e' : '#f59e0b';
                const examInfo = rows[0];

                const tableRows = rows.map((d, i) => {
                    const shortcutBadge = d.shortcuts
                        ? `<span style="background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:5px;white-space:nowrap;">${escapeHtml(d.shortcuts)}</span>`
                        : '';
                    return `<tr>
                        <td style="text-align:center;color:var(--gray-500);">${i + 1}</td>
                        <td>
                            ${shortcutBadge}${escapeHtml(d.faculty_name)}
                        </td>
                        <td>${formatDesignation(d.designation)}</td>
                        <td><span class="badge badge-ok" style="font-size:11px;">${d.status}</span></td>
                        <td style="white-space:nowrap;">
                            <select class="input" style="width:auto;font-size:12px;padding:3px 6px;height:28px;display:inline-block;" data-reassign="${d.duty_id}">
                                <option value="">Reassign...</option>
                                ${availFaculty.map(f => {
                                    const snoStr = f.serial_no ? `#${f.serial_no} ` : '';
                                    const scStr = f.shortcuts ? `(${f.shortcuts}) ` : '';
                                    return `<option value="${f.id}">${snoStr}${escapeHtml(f.name)} ${scStr}- ${f.duty_count} duties</option>`;
                                }).join('')}
                            </select>
                            <button class="btn btn-sm btn-danger" data-cancel-duty="${d.duty_id}" style="margin-left:4px;">Cancel</button>
                        </td>
                    </tr>`;
                }).join('');

                return `
                    <div style="border:2px solid ${sessionColor};border-radius:10px;margin-bottom:16px;overflow:hidden;">
                        <div style="background:#f0fdf4;padding:10px 16px;display:flex;align-items:center;gap:10px;">
                            <span style="background:${sessionColor};color:#fff;font-weight:700;font-size:12px;padding:3px 12px;border-radius:20px;">${sess}</span>
                            <span style="font-weight:600;">${escapeHtml(examInfo.exam_name)} - ${String(examInfo.exam_date).slice(0,10)}</span>
                            ${examInfo.course ? `<span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${escapeHtml(examInfo.course)}</span>` : ''}
                            ${examInfo.year_sem ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${escapeHtml(examInfo.year_sem)}</span>` : ''}
                            <span style="font-size:12px;color:var(--gray-600);margin-left:auto;">${rows.length} invigilator(s)</span>
                        </div>
                        <div class="table-wrap">
                            <table>
                                <thead><tr>
                                    <th style="width:40px;">#</th>
                                    <th>Faculty Name</th>
                                    <th>Designation</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr></thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>`;
            }).join('');

            resultEl.innerHTML = `
                <div class="panel" style="border:2px solid #22c55e;border-radius:10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                        <h3 class="panel-title" style="margin:0;">
                            Finalized Duty Chart
                            <span style="background:#22c55e;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:4px;margin-left:8px;">SAVED</span>
                        </h3>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-primary" id="regenerate-btn">Re-generate Draft</button>
                            <a class="btn" href="/api/allocation/export/session/excel?sessionIds=${sessionIds.join(',')}" download>Export Excel</a>
                            <a class="btn" href="/api/allocation/export/session/pdf?sessionIds=${sessionIds.join(',')}" download>Export PDF</a>
                            <button class="btn" id="download-emails-btn">Download Draft Emails</button>
                        </div>
                    </div>
                    ${sectionsHtml}
                </div>`;

            document.getElementById('regenerate-btn').addEventListener('click', () => generateBtn.click());
            document.getElementById('download-emails-btn').addEventListener('click', () => downloadDraftEmails(duties));

            resultEl.querySelectorAll('[data-reassign]').forEach(sel => {
                sel.addEventListener('change', async () => {
                    if (!sel.value) return;
                    try {
                        await api.put(`/allocation/session-duty/${sel.dataset.reassign}/reassign`, { faculty_id: sel.value });
                        showToast('Duty reassigned');
                        loadSavedDutyChart(sessionIds);
                    } catch (err) {
                        showToast(err.message, true);
                        sel.value = '';
                    }
                });
            });

            resultEl.querySelectorAll('[data-cancel-duty]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Cancel this duty?')) return;
                    try {
                        await api.del(`/allocation/session-duty/${btn.dataset.cancelDuty}`);
                        showToast('Duty cancelled');
                        loadSavedDutyChart(sessionIds);
                    } catch (err) {
                        showToast(err.message, true);
                    }
                });
            });
        }).catch(() => {});
    }

    function downloadDraftEmails(duties) {
        if (duties.length === 0) { showToast('No duties to export', true); return; }
        const byFaculty = new Map();
        for (const d of duties) {
            if (!byFaculty.has(d.faculty_name)) byFaculty.set(d.faculty_name, { designation: d.designation, sessions: [] });
            byFaculty.get(d.faculty_name).sessions.push(d.session);
        }
        const examInfo = duties[0];
        const sessionLabel = `${examInfo.exam_name} - ${String(examInfo.exam_date).slice(0,10)}`;
        let text = `INVIGILATION DUTY DRAFT EMAILS\nExam: ${sessionLabel}\nGenerated: ${new Date().toLocaleString()}\n${'=' .repeat(70)}\n\n`;
        for (const [name, info] of byFaculty) {
            text += `TO      : [${name}'s email]\nSUBJECT : Invigilation Duty - ${sessionLabel}\n\nDear ${name},\n\nYou are assigned invigilation duty for:\n  Exam    : ${sessionLabel}\n  Session : ${info.sessions.join(' & ')}\n\nPlease report 15 minutes before the exam starts.\n\nRegards,\nExamination Coordinator\n\n${'-'.repeat(70)}\n\n`;
        }
        const a  = document.createElement('a');
        a.href   = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = `duty_emails_${sessionLabel.replace(/[^a-z0-9]/gi,'_').slice(0,40)}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('Draft emails downloaded');
    }
}
