async function renderDutySheet(container) {
    let examNames = [];
    try {
        examNames = await api.get('/duty-sheet/list-exams');
    } catch (e) {
        console.error(e);
    }

    if (!examNames || examNames.length === 0) {
        try {
            const groups = await api.get('/exams/grouped');
            const set = new Set(groups.map(g => g.examName));
            examNames = Array.from(set);
        } catch (e) {
            console.error(e);
        }
    }

    container.innerHTML = `
        <div class="panel">
            <h3 class="panel-title">Duty Sheet Excel Export</h3>
            <p style="font-size:13px;color:var(--gray-600);margin-bottom:16px;">
                Select an exam name to generate an in-app draft preview of the consolidated duty sheet.
                Click <strong>Finalize &amp; Download Excel</strong> to download the styled <code>.xlsx</code> file.
            </p>
            <div class="row" style="align-items:flex-end;gap:12px;">
                <div class="field" style="min-width:200px;">
                    <label class="field-label">Select Exam Name</label>
                    <select class="input" id="duty-sheet-exam-select">
                        <option value="">-- Select Exam --</option>
                        ${examNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field" style="min-width:140px;">
                    <label class="field-label">Year / Sem <span style="font-size:11px;color:var(--gray-500);">(optional)</span></label>
                    <select class="input" id="duty-sheet-yearsem-select">
                        <option value="">-- All Year/Sems --</option>
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
                <button class="btn btn-primary" id="duty-sheet-preview-btn">Export Draft (Preview)</button>
                <button class="btn" style="background:#16a34a;color:#fff;" id="duty-sheet-finalize-btn" disabled>Finalize &amp; Download Excel</button>
            </div>
        </div>

        <div id="duty-sheet-preview-area"></div>
    `;

    const selectEl = document.getElementById('duty-sheet-exam-select');
    const yearSemEl = document.getElementById('duty-sheet-yearsem-select');
    const previewBtn = document.getElementById('duty-sheet-preview-btn');
    const finalizeBtn = document.getElementById('duty-sheet-finalize-btn');
    const previewArea = document.getElementById('duty-sheet-preview-area');

    selectEl.addEventListener('change', () => {
        const hasValue = !!selectEl.value;
        finalizeBtn.disabled = !hasValue;
    });

    previewBtn.addEventListener('click', async () => {
        const examName = selectEl.value;
        const yearSem = yearSemEl.value;
        if (!examName) {
            showToast('Please select an exam name first', true);
            return;
        }
        await loadPreview(examName, yearSem);
    });

    finalizeBtn.addEventListener('click', async () => {
        const examName = selectEl.value;
        const yearSem = yearSemEl.value;
        if (!examName) return;
        try {
            showToast('Generating Duty Sheet Excel file...');
            let path = `/duty-sheet/export?examName=${encodeURIComponent(examName)}`;
            if (yearSem) path += `&yearSem=${encodeURIComponent(yearSem)}`;
            const safeName = examName.replace(/[^a-zA-Z0-9\-_]/g, '_');
            const filename = `Duty_Sheet_${safeName}${yearSem ? '_' + yearSem : ''}.xlsx`;
            await api.download(path, filename);
            showToast('Duty Sheet downloaded successfully!');
        } catch (err) {
            showToast(err.message, true);
        }
    });

    async function loadPreview(examName, yearSem) {
        previewArea.innerHTML = '<p class="empty-state">Generating draft preview...</p>';
        try {
            let previewUrl = `/duty-sheet/preview?examName=${encodeURIComponent(examName)}`;
            if (yearSem) previewUrl += `&yearSem=${encodeURIComponent(yearSem)}`;
            const data = await api.get(previewUrl);
            renderPreviewTable(data);
            finalizeBtn.disabled = false;
        } catch (err) {
            previewArea.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
            showToast(err.message, true);
        }
    }

    function renderPreviewTable(data) {
        const { sessionCols, facultyRows, monthYearLabel } = data;

        if (!sessionCols || sessionCols.length === 0) {
            previewArea.innerHTML = `
                <div class="panel">
                    <p class="empty-state">No exam sessions found for exam "${escapeHtml(data.examName)}"${data.yearSem ? ` (${escapeHtml(data.yearSem)})` : ''}.</p>
                </div>`;
            return;
        }

        const sessHeaders1 = sessionCols.map(s => `<th style="background:#1f3864;color:#fff;text-align:center;font-size:11px;padding:4px 6px;">${escapeHtml(s.date)}</th>`).join('');
        const sessHeaders2 = sessionCols.map(s => `<th style="background:#1f3864;color:#fff;text-align:center;font-size:11px;padding:4px 6px;">${escapeHtml(s.day)}</th>`).join('');
        const sessHeaders3 = sessionCols.map(s => `<th style="background:#1f3864;color:#fff;text-align:center;font-size:11px;padding:4px 6px;">${escapeHtml(s.yearSem || 'CSE')}</th>`).join('');
        const sessHeaders4 = sessionCols.map(s => `<th style="background:#1f3864;color:#fff;text-align:center;font-size:11px;padding:4px 6px;">${escapeHtml(s.letter)}</th>`).join('');

        const rowsHtml = facultyRows.map((fr, idx) => {
            const bg = !fr.isActive ? '#fee2e2' : (idx % 2 !== 0 ? '#f8fafc' : '#fff');
            const nameColor = !fr.isActive ? '#64748b' : 'inherit';
            let examDutyCount = 0;
            const cellsHtml = fr.cells.map(val => {
                if (val) {
                    examDutyCount++;
                    return `<td style="background:#92d050;color:#000;font-weight:700;text-align:center;font-size:11px;padding:4px;">${escapeHtml(val)}</td>`;
                }
                return `<td style="text-align:center;background:${bg};"></td>`;
            }).join('');

            return `
                <tr style="background:${bg};">
                    <td style="text-align:center;font-size:12px;color:var(--gray-600);">${fr.serialNo || idx + 1}</td>
                    <td style="font-weight:600;font-size:12px;color:${nameColor}; font-style:${fr.isActive ? 'normal' : 'italic'};">
                        ${escapeHtml(fr.name)}
                    </td>
                    ${cellsHtml}
                    <td style="text-align:center;font-weight:700;font-size:12px;">${examDutyCount}</td>
                    <td style="text-align:center;font-size:11px;color:#3730a3;font-weight:600;">${escapeHtml(fr.shortcuts)}</td>
                    <td style="text-align:center;font-size:11px;color:var(--gray-700);">${escapeHtml(fr.contact || '-')}</td>
                    <td style="text-align:center;font-size:12px;">${fr.totalDuties}</td>
                    <td style="text-align:center;font-size:12px;">${fr.satDuties}</td>
                    <td style="text-align:center;font-size:12px;">${fr.sunDuties}</td>
                    <td style="text-align:center;font-size:11px;color:var(--gray-700);">${escapeHtml(fr.roomNo || '-')}</td>
                </tr>
            `;
        }).join('');

        const reqCellsHtml = sessionCols.map(s =>
            `<td style="text-align:center;font-weight:700;background:#fff5c4;">${s.requiredInvigilators || 0}</td>`
        ).join('');

        const legendItems = (data.legendList || []).map(item => `
            <div style="font-size:13px;line-height:1.6;margin-top:2px;">
                <strong style="color:#dc2626;font-weight:700;margin-right:4px;">${escapeHtml(item.letterKey)}:</strong>
                <span style="font-weight:600;color:var(--gray-800);">${escapeHtml(item.description)}</span>
            </div>
        `).join('');

        previewArea.innerHTML = `
            <div class="panel" style="overflow-x:auto;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <h4 style="margin:0;">Draft Duty Sheet Preview: ${escapeHtml(data.examName)}${data.yearSem ? ` (${escapeHtml(data.yearSem)})` : ''}</h4>
                    <span class="badge badge-ok">Draft Preview</span>
                </div>

                <div class="table-wrap" style="max-height:600px;overflow:auto;">
                    <table style="border-collapse:collapse;width:100%;font-size:12px;">
                        <thead>
                            <tr>
                                <th rowspan="3" style="background:#1f3864;color:#fff;text-align:center;vertical-align:middle;width:45px;">S.No.</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;padding:4px 8px;">${escapeHtml(monthYearLabel)}</th>
                                ${sessHeaders1}
                                <th style="background:#1f3864;color:#fff;text-align:center;font-size:10px;padding:4px 6px;">Duties<br>This Exam</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">Shortcut</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">Contact</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">TC</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">Sa</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">Su</th>
                                <th style="background:#1f3864;color:#fff;text-align:center;">Room No</th>
                            </tr>
                            <tr>
                                <th style="background:#1f3864;color:#fff;text-align:center;padding:4px 8px;"></th>
                                ${sessHeaders2}
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                            </tr>
                            <tr>
                                <th style="background:#1f3864;color:#fff;text-align:center;padding:4px 8px;">CSE</th>
                                ${sessHeaders3}
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                            </tr>
                            <tr>
                                <th style="background:#1f3864;color:#fff;text-align:center;padding:4px 6px;">S.No</th>
                                <th style="background:#1f3864;color:#fff;text-align:left;padding:4px 8px;">Faculty Name</th>
                                ${sessHeaders4}
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                                <th style="background:#1f3864;color:#fff;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                            <tr style="background:#fff5c4;font-weight:700;">
                                <td></td>
                                <td style="text-align:left;padding:6px 8px;">Required</td>
                                ${reqCellsHtml}
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                ${legendItems ? `
                <div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                    <div style="font-size:12px;font-weight:700;color:var(--gray-700);margin-bottom:6px;">Legend / Session Key:</div>
                    ${legendItems}
                </div>` : ''}
            </div>
        `;
    }
}
