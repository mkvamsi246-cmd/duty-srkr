require('dotenv').config();
const db = require('./db');

(async () => {
  try {
    const { rows } = await db.query(`
      SELECT f.serial_no, f.name, f.designation, f.department,
             COUNT(ft.id) AS period_count
      FROM faculty f
      JOIN faculty_timetable ft ON ft.faculty_id = f.id
      GROUP BY f.id, f.serial_no, f.name, f.designation, f.department
      ORDER BY f.serial_no DESC NULLS LAST, f.name
    `);
    console.log('Faculty WITH timetable entries: ' + rows.length);
    rows.forEach((r, i) => {
      const sno = r.serial_no != null ? r.serial_no : '-';
      console.log((i + 1) + '. [S.No ' + sno + '] ' + r.name + ' | ' + r.designation + ' | ' + (r.department || '—') + ' | ' + r.period_count + ' periods');
    });

    const { rows: noTT } = await db.query(`
      SELECT f.serial_no, f.name, f.designation, f.department
      FROM faculty f
      LEFT JOIN faculty_timetable ft ON ft.faculty_id = f.id
      WHERE ft.id IS NULL
      ORDER BY f.serial_no DESC NULLS LAST, f.name
    `);
    console.log('\nFaculty with NO timetable entries: ' + noTT.length);
    noTT.forEach((r, i) => {
      const sno = r.serial_no != null ? r.serial_no : '-';
      console.log((i + 1) + '. [S.No ' + sno + '] ' + r.name + ' | ' + (r.department || '—'));
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.pool.end();
  }
})();
