const db = require('../db');

async function purgeData() {
    console.log('--- Purging all data except user login credentials ---');

    await db.query('TRUNCATE TABLE session_duty RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE exam_room_allocation RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE faculty_timetable RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE faculty_unavailability RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE exam_sessions RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE classrooms RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE faculty RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE import_log RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE settings RESTART IDENTITY CASCADE;');

    console.log('✔ All application data cleared successfully!');

    const { rows: users } = await db.query('SELECT username, department_name FROM users ORDER BY username');
    console.log('Preserved User Logins:');
    users.forEach(u => console.log(`  - ${u.username} (${u.department_name})`));
}

purgeData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
