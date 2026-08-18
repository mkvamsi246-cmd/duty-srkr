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
                Select an exam name, optional course/year/sem, or date range to generate an in-app preview and download the styled Excel <code>.xlsx</code> file matching the exact duty sheet layout.
            </p>
            <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap;">
                <div class="field" style="min-width:180px;">
                    <label class="field-label">Select Exam Name</label>
                    <select class="input" id="duty-sheet-exam-select">
                        <option value="">-- Select Exam --</option>
                        <option value="ALL">-- All Exams --</option>
                        ${examNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field" style="min-width:120px;">
                    <label class="field-label">Course <span style="font-size:11px;color:var(--gray-500);">(opt)</span></label>
                    <select class="input" id="duty-sheet-course-select">
                        <option value="">-- All --</option>
                        <option value="B.Tech">B.Tech</option>
                        <option value="M.Tech">M.Tech</option>
                        <option value="B.B.A">B.B.A</option>
                    </select>
                </div>
                <div class="field" style="min-width:130px;">
                    <label class="field-label">Year / Sem <span style="font-size:11px;color:var(--gray-500);">(opt)</span></label>
                    <select class="input" id="duty-sheet-yearsem-select">
                        <option value="">-- All --</option>
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
                <div class="field" style="min-width:130px;">
                    <label class="field-label">From Date <span style="font-size:11px;color:var(--gray-500);">(opt)</span></label>
                    <input class="input" type="date" id="duty-sheet-startdate-input">
                </div>
                <div class="field" style="min-width:130px;">
                    <label class="field-label">To Date <span style="font-size:11px;color:var(--gray-500);">(opt)</span></label>
                    <input class="input" type="date" id="duty-sheet-enddate-input">
                </div>
                <button class="btn btn-primary" id="duty-sheet-preview-btn">Export Draft (Preview)</button>
                <button class="btn" style="background:#16a34a;color:#fff;" id="duty-sheet-finalize-btn" disabled>Finalize &amp; Download Excel</button>
            </div>
        </div>

        <div id="duty-sheet-preview-area"></div>
    `;

    const selectEl = document.getElementById('duty-sheet-exam-select');
    const courseEl = document.getElementById('duty-sheet-course-select');
    const yearSemEl = document.getElementById('duty-sheet-yearsem-select');
    const startDateEl = document.getElementById('duty-sheet-startdate-input');
    const endDateEl = document.getElementById('duty-sheet-enddate-input');
    const previewBtn = document.getElementById('duty-sheet-preview-btn');
    const finalizeBtn = document.getElementById('duty-sheet-finalize-btn');
    const previewArea = document.getElementById('duty-sheet-preview-area');

    selectEl.addEventListener('change', () => {
        const hasValue = !!selectEl.value;
        finalizeBtn.disabled = !hasValue;
    });

    function getQueryParams() {
        const examName = selectEl.value;
        const yearSem = yearSemEl.value;
        const course = courseEl.value;
        const startDate = startDateEl.value;
        const endDate = endDateEl.value;
        let query = `examName=${encodeURIComponent(examName)}`;
        if (yearSem)   query += `&yearSem=${encodeURIComponent(yearSem)}`;
        if (course)    query += `&course=${encodeURIComponent(course)}`;
        if (startDate) query += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate)   query += `&endDate=${encodeURIComponent(endDate)}`;
        return { examName, yearSem, course, startDate, endDate, query };
    }

    previewBtn.addEventListener('click', async () => {
        const { examName, query } = getQueryParams();
        if (!examName) {
            showToast('Please select an exam name first', true);
            return;
        }
        await loadPreview(query);
    });

    finalizeBtn.addEventListener('click', async () => {
        const { examName, course, yearSem, query } = getQueryParams();
        if (!examName) return;
        try {
            showToast('Generating Duty Sheet Excel file...');
            const path = `/duty-sheet/export?${query}`;
            const safeName = examName.replace(/[^a-zA-Z0-9\-_]/g, '_');
            const filename = `Duty_Sheet_${safeName}${course ? '_' + course : ''}${yearSem ? '_' + yearSem : ''}.xlsx`;
            await api.download(path, filename);
            showToast('Duty Sheet downloaded successfully!');
        } catch (err) {
            showToast(err.message, true);
        }
    });

    async function loadPreview(query) {
        previewArea.innerHTML = '<p class="empty-state">Generating draft preview...</p>';
        try {
            const data = await api.get(`/duty-sheet/preview?${query}`);
            renderPreviewTable(data);
            finalizeBtn.disabled = false;
        } catch (err) {
            previewArea.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(err.message)}</p></div>`;
            showToast(err.message, true);
        }
    }

    function renderPreviewTable(data) {
        const {
            sessionCols, facultyRows, monthYearLabel
        } = data;

        if (!sessionCols || sessionCols.length === 0) {
            previewArea.innerHTML = `
                <div class="panel">
                    <p class="empty-state">No exam sessions found for the selected criteria.</p>
                </div>`;
            return;
        }

        const sessHeaders1 = sessionCols.map(s =>
            `<th style="background:#fff;color:#000;border:1px solid #cbd5e1;text-align:center;font-size:12px;padding:4px 6px;">${s.dateNum}</th>`
        ).join('');

        const sessHeaders2 = sessionCols.map(s =>
            `<th style="background:#fff;color:#000;border:1px solid #cbd5e1;text-align:center;font-size:11px;padding:4px 6px;">${escapeHtml(s.day)}</th>`
        ).join('');

        const sessHeaders3 = sessionCols.map(s =>
            `<th style="background:#fff;color:#000;border:1px solid #cbd5e1;text-align:center;font-size:12px;padding:4px 6px;font-weight:700;">${escapeHtml(s.letter)}</th>`
        ).join('');

        const rowsHtml = facultyRows.map((fr, idx) => {
            const isInactive = !fr.isActive;
            const bg = isInactive ? '#ed7d31' : (idx % 2 !== 0 ? '#fafafa' : '#fff');
            const textColor = isInactive ? '#000000' : 'inherit';

            const cellsHtml = fr.cells.map((val) => {
                if (isInactive) {
                    return `<td style="background:#ed7d31;color:#000000;font-weight:700;text-align:center;font-size:11px;padding:4px;border:1px solid #cbd5e1;">${escapeHtml(val || '')}</td>`;
                } else if (val) {
                    return `<td style="background:#ffffff;color:#000000;font-weight:700;text-align:center;font-size:11px;padding:4px;border:1px solid #cbd5e1;">${escapeHtml(val)}</td>`;
                }
                return `<td style="text-align:center;background:#ffffff;border:1px solid #cbd5e1;"></td>`;
            }).join('');

            return `
                <tr style="background:${bg};">
                    <td style="text-align:center;font-size:12px;color:${textColor};font-weight:${isInactive ? '700' : 'normal'};border:1px solid #cbd5e1;">${fr.serialNo || idx + 1}</td>
                    <td style="font-weight:600;font-size:12px;color:${textColor};border:1px solid #cbd5e1;">
                        ${escapeHtml(fr.name)}
                    </td>
                    ${cellsHtml}
                    <td style="text-align:center;font-weight:700;font-size:12px;background:${bg};color:${textColor};border:1px solid #cbd5e1;">${fr.totalDuties}</td>
                    <td style="text-align:center;font-size:11px;color:${isInactive ? '#000000' : '#3730a3'};font-weight:700;border:1px solid #cbd5e1;">${escapeHtml(fr.shortcuts)}</td>
                    <td style="text-align:center;font-size:11px;color:${textColor};border:1px solid #cbd5e1;">${escapeHtml(fr.contact || '-')}</td>
                    <td style="text-align:center;font-size:12px;font-weight:700;border:1px solid #cbd5e1;">${fr.totalDuties}</td>
                    <td style="text-align:center;font-size:12px;border:1px solid #cbd5e1;">${fr.satDuties}</td>
                    <td style="text-align:center;font-size:12px;border:1px solid #cbd5e1;">${fr.sunDuties}</td>
                    <td style="text-align:center;font-size:11px;color:${textColor};border:1px solid #cbd5e1;">${escapeHtml(fr.roomNo || '-')}</td>
                </tr>
            `;
        }).join('');

        const reqCellsHtml = sessionCols.map(s =>
            `<td style="text-align:center;font-weight:700;background:#fff5c4;border:1px solid #cbd5e1;">${s.requiredInvigilators || 0}</td>`
        ).join('');

        const legendItems = (data.legendList || []).map(item => `
            <div style="font-size:13px;line-height:1.6;margin-top:2px;">
                <strong style="color:#dc2626;font-weight:700;margin-right:4px;">${escapeHtml(item.letterKey)}:</strong>
                <span style="font-weight:600;color:var(--gray-800);">${escapeHtml(item.description)}</span>
            </div>
        `).join('');

        const thStyle = "background:#fff;color:#000;border:1px solid #cbd5e1;text-align:center;font-weight:700;";

        previewArea.innerHTML = `
            <div class="panel" style="overflow-x:auto;">
                <div class="table-wrap" style="max-height:650px;overflow:auto;">
                    <table style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e1;">
                        <thead>
                            <tr>
                                <th rowspan="3" style="${thStyle}vertical-align:middle;width:45px;">S. NO</th>
                                <th style="${thStyle}padding:4px 8px;">${escapeHtml(monthYearLabel)}</th>
                                ${sessHeaders1}
                                <th style="${thStyle}font-size:11px;padding:4px 8px;">DUTIES THIS EXAM</th>
                                <th style="${thStyle}">SHORT CUT</th>
                                <th style="${thStyle}">CONTACT</th>
                                <th style="${thStyle}">TC</th>
                                <th style="${thStyle}">S A</th>
                                <th style="${thStyle}">S U</th>
                                <th style="${thStyle}">ROOM NO</th>
                            </tr>
                            <tr>
                                <th style="${thStyle}padding:4px 8px;">CSE</th>
                                ${sessHeaders2}
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                            </tr>
                            <tr>
                                <th style="${thStyle}text-align:left;padding:4px 8px;">FACULTY NAME</th>
                                ${sessHeaders3}
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                            <tr style="background:#fff5c4;font-weight:700;">
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="text-align:left;padding:6px 8px;border:1px solid #cbd5e1;">Required</td>
                                ${reqCellsHtml}
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
                                <td style="border:1px solid #cbd5e1;"></td>
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
