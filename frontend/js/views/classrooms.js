async function renderClassrooms(container) {
    const classrooms = await api.get('/classrooms');

    container.innerHTML = `
        <div class="panel">
            <h3 class="panel-title">Add Classroom</h3>
            <form id="classroom-form" class="row">
                <div class="field"><label class="field-label">Room No</label><input class="input" name="room_no" required></div>
                <div class="field"><label class="field-label">Building</label><input class="input" name="building"></div>
                <div class="field"><label class="field-label">Capacity</label><input class="input" name="capacity" type="number" min="1" required></div>
                <button class="btn btn-primary" type="submit">Add</button>
            </form>
        </div>

        <div class="panel">
            <h3 class="panel-title">All Classrooms (${classrooms.length})</h3>
            ${classrooms.length === 0 ? '<p class="empty-state">No classrooms added yet.</p>' : `
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Room No</th><th>Building</th><th>Capacity</th><th>Faculty Needed (at full)</th><th></th></tr></thead>
                    <tbody>
                        ${classrooms.map((c) => `
                            <tr>
                                <td>${escapeHtml(c.room_no)}</td>
                                <td>${escapeHtml(c.building || '—')}</td>
                                <td>${c.capacity}</td>
                                <td>${Math.ceil(c.capacity / 24)}</td>
                                <td><button class="btn btn-sm btn-danger" data-delete-room="${c.id}">Delete</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`}
        </div>
    `;

    document.getElementById('classroom-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api.post('/classrooms', Object.fromEntries(fd));
            showToast('Classroom added');
            renderClassrooms(container);
        } catch (err) {
            showToast(err.message, true);
        }
    });

    container.querySelectorAll('[data-delete-room]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this classroom?')) return;
            try {
                await api.del(`/classrooms/${btn.dataset.deleteRoom}`);
                showToast('Classroom removed');
                renderClassrooms(container);
            } catch (err) {
                showToast(err.message, true);
            }
        });
    });
}
