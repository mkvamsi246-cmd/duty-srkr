async function renderFaculty(container) {
    const faculty = await api.get('/faculty');

    container.innerHTML = `
        <div class="panel">
            <h3 class="panel-title">Add Faculty</h3>
            <form id="faculty-form" class="row">
                <div class="field" style="max-width:80px;">
                    <label class="field-label" title="Serial number — used as the selection-order key. Highest S.No is assigned first.">
                        S.No <span style="font-size:10px;color:var(--gray-500);">↑ higher = first</span>
                    </label>
                    <input class="input" name="serial_no" id="serial-no-input" type="number" min="1" placeholder="e.g. 42">
                </div>
                <div class="field"><label class="field-label">Name</label><input class="input" name="name" required></div>
                <div class="field">
                    <label class="field-label">Designation</label>
                    <select class="input" name="designation" id="desig-select" required>
                        <option value="assistant_professor">Assistant Professor</option>
                        <option value="associate_professor">Associate Professor</option>
                        <option value="professor">Professor</option>
                    </select>
                </div>
                <div class="field"><label class="field-label">Department</label><input class="input" name="department"></div>
                <div class="field" style="max-width:110px;"><label class="field-label">Shortcuts</label><input class="input" name="shortcuts" placeholder="e.g. AE"></div>
                <div class="field" style="max-width:130px;"><label class="field-label">Contact</label><input class="input" name="contact" placeholder="Contact/Phone"></div>
                <div class="field" style="max-width:100px;"><label class="field-label">Room No</label><input class="input" name="room_no" placeholder="Room No"></div>
                <div class="field" style="max-width:100px;">
                    <label class="field-label">Duty Count</label>
                    <input class="input" name="duty_count" type="number" min="0" value="0">
                </div>
                <button class="btn btn-primary" type="submit">Add</button>
            </form>
        </div>

        <div class="panel">
            <h3 class="panel-title">All Faculty (${faculty.length})</h3>
            <p style="font-size:12px;color:var(--gray-500);margin:-6px 0 10px;">
                <strong>S.No</strong>: controls selection order — faculty with the highest S.No are assigned first.
            </p>
            ${faculty.length === 0 ? '<p class="empty-state">No faculty added yet.</p>' : `
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>S.No</th><th>Name</th><th>Designation</th><th>Dept</th>
                        <th>Shortcuts</th><th>Contact</th><th>Room No</th>
                        <th>Duty Count</th>
                        <th>Status</th><th>Actions</th>
                    </tr></thead>
                    <tbody>${faculty.map(facultyRow).join('')}</tbody>
                </table>
            </div>`}
        </div>

        <!-- Edit Modal Container -->
        <div id="edit-faculty-modal" class="modal-backdrop hidden">
            <div class="modal" style="width:480px;">
                <h3>Edit Faculty Member</h3>
                <form id="edit-faculty-form" style="display:flex;flex-direction:column;gap:12px;">
                    <input type="hidden" id="edit-faculty-id">
                    <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
                        <div>
                            <label class="field-label">S.No</label>
                            <input class="input" id="edit-serial-no" type="number" min="1">
                        </div>
                        <div>
                            <label class="field-label">Name *</label>
                            <input class="input" id="edit-name" required>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label class="field-label">Designation *</label>
                            <select class="input" id="edit-designation" required>
                                <option value="assistant_professor">Assistant Professor</option>
                                <option value="associate_professor">Associate Professor</option>
                                <option value="professor">Professor</option>
                            </select>
                        </div>
                        <div>
                            <label class="field-label">Department</label>
                            <input class="input" id="edit-department">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                        <div>
                            <label class="field-label">Shortcuts</label>
                            <input class="input" id="edit-shortcuts" placeholder="e.g. AE">
                        </div>
                        <div>
                            <label class="field-label">Contact</label>
                            <input class="input" id="edit-contact" placeholder="Contact">
                        </div>
                        <div>
                            <label class="field-label">Room No</label>
                            <input class="input" id="edit-room-no" placeholder="Room No">
                        </div>
                    </div>
                    <div>
                        <label class="field-label">Duty Count</label>
                        <input class="input" id="edit-duty-count" type="number" min="0">
                    </div>
                    <div class="modal-actions">
                        <button class="btn" type="button" id="close-edit-modal">Cancel</button>
                        <button class="btn btn-primary" type="submit">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // ── Add faculty ───────────────────────────────────────────────────
    document.getElementById('faculty-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        data.duty_count = parseInt(data.duty_count, 10) || 0;
        data.serial_no  = data.serial_no !== '' ? parseInt(data.serial_no, 10) || null : null;
        if (!data.shortcuts) delete data.shortcuts;
        try {
            await api.post('/faculty', data);
            showToast('Faculty added');
            renderFaculty(container);
        } catch (err) {
            showToast(err.message, true);
        }
    });

    // ── Edit Faculty Modal Open / Save ────────────────────────────────
    const editModal = document.getElementById('edit-faculty-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-faculty-form');

    closeEditModalBtn.addEventListener('click', () => editModal.classList.add('hidden'));

    container.querySelectorAll('[data-edit-faculty]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.editFaculty;
            const f = faculty.find(x => String(x.id) === String(id));
            if (!f) return;

            document.getElementById('edit-faculty-id').value = f.id;
            document.getElementById('edit-serial-no').value = f.serial_no != null ? f.serial_no : '';
            document.getElementById('edit-name').value = f.name || '';
            document.getElementById('edit-designation').value = f.designation || 'assistant_professor';
            document.getElementById('edit-department').value = f.department || '';
            document.getElementById('edit-shortcuts').value = f.shortcuts || '';
            document.getElementById('edit-contact').value = f.contact || f.phone || '';
            document.getElementById('edit-room-no').value = f.room_no || '';
            document.getElementById('edit-duty-count').value = f.duty_count || 0;

            editModal.classList.remove('hidden');
        });
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-faculty-id').value;
        const snoVal = document.getElementById('edit-serial-no').value.trim();
        const payload = {
            serial_no:   snoVal !== '' ? parseInt(snoVal, 10) : null,
            name:        document.getElementById('edit-name').value.trim(),
            designation: document.getElementById('edit-designation').value,
            department:  document.getElementById('edit-department').value.trim() || null,
            shortcuts:   document.getElementById('edit-shortcuts').value.trim() || null,
            contact:     document.getElementById('edit-contact').value.trim() || null,
            room_no:     document.getElementById('edit-room-no').value.trim() || null,
            duty_count:  parseInt(document.getElementById('edit-duty-count').value, 10) || 0,
        };

        try {
            await api.put(`/faculty/${id}`, payload);
            showToast('Faculty updated successfully!');
            editModal.classList.add('hidden');
            renderFaculty(container);
        } catch (err) {
            showToast(err.message, true);
        }
    });

    // ── Activate / Deactivate ─────────────────────────────────────────
    container.querySelectorAll('[data-toggle-active]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.toggleActive;
            try {
                await api.put(`/faculty/${id}`, { is_active: btn.dataset.isActive !== 'true' });
                renderFaculty(container);
            } catch (err) { showToast(err.message, true); }
        });
    });

    // ── Delete ────────────────────────────────────────────────────────
    container.querySelectorAll('[data-delete-faculty]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this faculty member?')) return;
            try {
                await api.del(`/faculty/${btn.dataset.deleteFaculty}`);
                showToast('Faculty removed');
                renderFaculty(container);
            } catch (err) { showToast(err.message, true); }
        });
    });

    // ── S.No save ─────────────────────────────────────────────────────
    container.querySelectorAll('button[data-save-sno]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id  = btn.dataset.saveSno;
            const inp = container.querySelector(`input[data-sno="${id}"]`);
            const val = inp.value.trim() === '' ? null : parseInt(inp.value, 10);
            if (val !== null && (isNaN(val) || val < 1)) { showToast('S.No must be a positive integer', true); inp.focus(); return; }
            btn.textContent = '…'; btn.disabled = true;
            try {
                await api.put(`/faculty/${id}`, { serial_no: val });
                showToast('S.No saved');
                renderFaculty(container);
            } catch (err) {
                showToast(err.message, true);
                btn.textContent = '✓'; btn.disabled = false;
            }
        });
    });

    // ── Duty count save ───────────────────────────────────────────────
    container.querySelectorAll('button[data-save-dc]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id  = btn.dataset.saveDc;
            const inp = container.querySelector(`input[data-dc="${id}"]`);
            const val = parseInt(inp.value, 10);
            if (isNaN(val) || val < 0) { showToast('Enter a valid non-negative number', true); inp.focus(); return; }
            btn.textContent = '…'; btn.disabled = true;
            try {
                await api.patch(`/faculty/${id}/duty-count`, { duty_count: val });
                showToast('Duty count saved');
                renderFaculty(container);
            } catch (err) {
                showToast(err.message, true);
                btn.textContent = '✓'; btn.disabled = false;
            }
        });
    });

    // Enter key on S.No / duty-count inputs
    container.querySelectorAll('input[data-sno]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); container.querySelector(`button[data-save-sno="${inp.dataset.sno}"]`).click(); }
        });
    });
    container.querySelectorAll('input[data-dc]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); container.querySelector(`button[data-save-dc="${inp.dataset.dc}"]`).click(); }
        });
    });
}

function facultyRow(f) {
    const snoDisplay = f.serial_no != null
        ? `<span style="background:#7c3aed;color:#fff;font-size:11px;font-weight:700;padding:1px 7px;border-radius:12px;min-width:22px;text-align:center;display:inline-block;">${f.serial_no}</span>`
        : `<span style="color:var(--gray-400);font-size:12px;">—</span>`;
    return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:5px;">
                    ${snoDisplay}
                    <input data-sno="${f.id}" type="number" min="1" value="${f.serial_no != null ? f.serial_no : ''}"
                        placeholder="—" class="input" style="width:58px;padding:3px 6px;height:28px;font-size:13px;">
                    <button data-save-sno="${f.id}" class="btn btn-sm btn-primary"
                        style="height:28px;padding:3px 8px;font-size:12px;" title="Save S.No">✓</button>
                </div>
            </td>
            <td><strong>${escapeHtml(f.name)}</strong></td>
            <td>${formatDesignation(f.designation)}</td>
            <td>${escapeHtml(f.department || '—')}</td>
            <td style="font-size:12px;color:var(--gray-600);">${escapeHtml(f.shortcuts || '—')}</td>
            <td style="font-size:12px;color:var(--gray-700);">${escapeHtml(f.contact || '—')}</td>
            <td style="font-size:12px;color:var(--gray-700);">${escapeHtml(f.room_no || '—')}</td>
            <td>
                <div style="display:flex;align-items:center;gap:5px;">
                    <input data-dc="${f.id}" type="number" min="0" value="${f.duty_count}" class="input"
                        style="width:58px;padding:3px 6px;height:28px;font-size:13px;">
                    <button data-save-dc="${f.id}" class="btn btn-sm btn-primary"
                        style="height:28px;padding:3px 8px;font-size:12px;" title="Save duty count">✓</button>
                </div>
            </td>
            <td>${f.is_active
                ? '<span class="badge badge-ok">Active</span>'
                : '<span class="badge badge-neutral">Inactive</span>'}</td>
            <td>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button class="btn btn-sm btn-primary" data-edit-faculty="${f.id}">Edit</button>
                    <button class="btn btn-sm" data-toggle-active="${f.id}" data-is-active="${f.is_active}">
                        ${f.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-sm btn-danger" data-delete-faculty="${f.id}">Delete</button>
                </div>
            </td>
        </tr>
    `;
}

