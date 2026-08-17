async function renderImport(container) {
    const importTypes = [
        {
            key:   'timetable',
            step:  '1',
            label: 'Faculty Weekly Timetable',
            icon:  '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
            color: '#3b82f6',
            hint:  'Upload "Individual Load" sheet per faculty (Mon-Sat rows, Period 1-8). Subject format: <code>year-sem-Subject-Section</code> (e.g. 3-1-CN-CSE-B).',
            note:  'Prevents double-booking during class hours.',
            cols:  ['Faculty Name', 'Period Header (1..8)', 'Day (Mon-Sat)', 'Year-Sem Subject Code'],
        },
        {
            key:   'faculty',
            step:  '2',
            label: 'Faculty Master List',
            icon:  '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
            color: '#10b981',
            hint:  'Primary faculty list matched by <strong>S.No</strong>. Re-uploading updates existing records and inserts new ones.',
            note:  'Supported columns: S.No, Name, Designation, Department, Shortcuts, Email, Contact, Room No.',
            cols:  ['S.No (required)', 'Name', 'Designation', 'Department', 'Shortcuts', 'Email', 'Contact', 'Room No'],
        },
        {
            key:   'exam_sessions',
            step:  '3',
            label: 'Exam Sessions',
            icon:  '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>',
            color: '#8b5cf6',
            hint:  'Bulk import exam schedules with dates, sessions, year-sem, and required headcount.',
            note:  'Supports FN, AN, or BOTH in session column.',
            cols:  ['Exam Name', 'Date', 'Session (FN/AN/BOTH)', 'Year/Sem', 'Required Invigilators'],
        },
    ];

    container.innerHTML = `
        <div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
                <div>
                    <h3 style="margin:0 0 4px;font-size:20px;font-weight:700;">Bulk Import Data (Excel)</h3>
                    <p style="margin:0;font-size:13px;color:var(--gray-600);">
                        Select your Excel file directly in the corresponding category card below.
                    </p>
                </div>
                <div style="display:flex;align-items:center;gap:6px;background:#f1f5f9;padding:6px 12px;border-radius:20px;font-size:12px;color:#475569;font-weight:600;">
                    <span>Recommended Order:</span>
                    <span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;">1. Timetable</span>
                    <span>&rarr;</span>
                    <span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;">2. Faculty</span>
                    <span>&rarr;</span>
                    <span style="background:#8b5cf6;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;">3. Exam Sessions</span>
                </div>
            </div>

            <!-- Direct Upload Cards Grid -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;margin-bottom:24px;">
                ${importTypes.map(t => `
                    <div class="import-card" style="border:1px solid #cbd5e1;border-radius:12px;padding:20px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.04);display:flex;flex-direction:column;justify-content:space-between;">
                        <div>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div style="width:38px;height:38px;border-radius:10px;background:${t.color}15;color:${t.color};display:flex;align-items:center;justify-content:center;">
                                        ${t.icon}
                                    </div>
                                    <div>
                                        <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;color:${t.color};text-transform:uppercase;">Step ${t.step}</span>
                                        <h4 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(t.label)}</h4>
                                    </div>
                                </div>
                                <a href="/api/templates/${t.key}"
                                   download
                                   class="btn btn-sm"
                                   style="font-size:11px;padding:4px 10px;border-color:#cbd5e1;color:#334155;background:#f8fafc;"
                                   title="Download sample Excel template">
                                   <span style="margin-right:4px;">&darr;</span> Sample
                                </a>
                            </div>

                            <p style="font-size:12px;color:#475569;margin:0 0 12px;line-height:1.5;">${t.hint}</p>

                            <div style="margin-bottom:14px;">
                                <div style="font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Accepted Columns:</div>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                    ${t.cols.map(c => `<span style="background:#f1f5f9;color:#334155;font-size:10.5px;padding:2px 7px;border-radius:4px;font-weight:500;">${c}</span>`).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Direct File Input Form inside Card -->
                        <form class="card-import-form" data-type-key="${t.key}" style="border-top:1px solid #f1f5f9;padding-top:14px;margin-top:10px;">
                            <div class="card-file-box" style="border:2px dashed #cbd5e1;border-radius:8px;padding:12px;text-align:center;background:#f8fafc;cursor:pointer;margin-bottom:12px;transition:all 0.2s ease;">
                                <input type="file" class="card-file-input" name="file" accept=".xlsx,.xls" required style="display:none;">
                                <div class="card-file-content">
                                    <div style="font-size:12px;font-weight:600;color:#334155;">Click to choose ${t.label} (.xlsx)</div>
                                </div>
                            </div>
                            <button class="btn btn-primary btn-block card-submit-btn" type="submit" style="height:38px;font-size:13px;border-radius:6px;background:${t.color};border-color:${t.color};">
                                Upload &amp; Import ${t.label}
                            </button>
                        </form>
                    </div>
                `).join('')}
            </div>
        </div>

        <div id="import-result"></div>
    `;

    const resultEl = document.getElementById('import-result');

    // Attach submit listeners to each card form
    container.querySelectorAll('.card-import-form').forEach(form => {
        const key = form.dataset.typeKey;
        const fileInput = form.querySelector('.card-file-input');
        const fileBox = form.querySelector('.card-file-box');
        const fileContent = form.querySelector('.card-file-content');
        const submitBtn = form.querySelector('.card-submit-btn');

        fileBox.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
                fileBox.style.borderColor = '#10b981';
                fileBox.style.background = '#f0fdf4';
                fileContent.innerHTML = `
                    <div style="font-size:12px;font-weight:700;color:#065f46;">✓ ${escapeHtml(file.name)}</div>
                    <div style="font-size:10.5px;color:#059669;">${sizeMb} MB &bull; Ready</div>
                `;
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!fileInput.files || !fileInput.files[0]) {
                showToast('Please select an Excel file first', true);
                return;
            }

            const fd = new FormData();
            fd.append('file', fileInput.files[0]);

            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading...';
            resultEl.innerHTML = '<div class="panel" style="padding:16px;text-align:center;color:#475569;font-size:14px;">Uploading and parsing file...</div>';

            try {
                const res = await api.upload(`/upload/${key}`, fd);
                resultEl.innerHTML = `
                    <div class="panel" style="border:1px solid #10b981;border-radius:12px;padding:20px;background:#f0fdf4;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                            <svg width="24" height="24" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <h4 style="margin:0;font-size:16px;color:#065f46;font-weight:700;">Import Completed Successfully</h4>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#047857;">
                            <span style="background:#d1fae5;padding:4px 10px;border-radius:6px;font-weight:700;">Rows Imported: ${res.imported || 0}</span>
                            <span style="background:#e0f2fe;color:#0369a1;padding:4px 10px;border-radius:6px;font-weight:700;">Total Rows: ${res.total || 0}</span>
                            ${res.skipped ? `<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:6px;font-weight:700;">Skipped: ${res.skipped}</span>` : ''}
                        </div>
                        ${res.warning ? `<div style="margin-top:10px;padding:8px 12px;background:#fee2e2;color:#991b1b;border-radius:6px;font-size:12px;font-weight:600;">${escapeHtml(res.warning)}</div>` : ''}
                    </div>
                `;
                showToast('Import completed successfully!');
                fileInput.value = '';
                fileBox.style.borderColor = '#cbd5e1';
                fileBox.style.background = '#f8fafc';
                fileContent.innerHTML = `<div style="font-size:12px;font-weight:600;color:#334155;">Click to choose ${form.dataset.typeKey} file (.xlsx)</div>`;
            } catch (err) {
                resultEl.innerHTML = `
                    <div class="panel" style="border:1px solid #ef4444;border-radius:12px;padding:20px;background:#fef2f2;">
                        <h4 style="margin:0 0 6px;font-size:15px;color:#991b1b;font-weight:700;">Import Failed</h4>
                        <p style="margin:0;font-size:13px;color:#b91c1c;">${escapeHtml(err.message)}</p>
                    </div>
                `;
                showToast(err.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = `Upload & Import`;
            }
        });
    });
}

