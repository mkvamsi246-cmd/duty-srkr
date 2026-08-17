const db = require('../db');

async function runMigration() {
    console.log('1. Creating users table...');
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id              SERIAL PRIMARY KEY,
            username        VARCHAR(50) UNIQUE NOT NULL,
            password        VARCHAR(255) NOT NULL,
            department_name VARCHAR(100),
            created_at      TIMESTAMP NOT NULL DEFAULT now()
        );
    `);

    console.log('2. Seeding department user accounts...');
    const accounts = [
        ['mech-srkr',  'mech@123',  'Mechanical Engineering'],
        ['CSE-srkr',   'cse@123',   'Computer Science & Engineering'],
        ['civil-srkr', 'civil@123', 'Civil Engineering'],
        ['eee-srkr',   'eee@123',   'Electrical & Electronics Engineering'],
        ['ece-srkr',   'ece@123',   'Electronics & Communication Engineering'],
        ['it-srkr',    'it@123',    'Information Technology']
    ];

    for (const [u, p, d] of accounts) {
        await db.query(
            `INSERT INTO users (username, password, department_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (username) DO NOTHING`,
            [u, p, d]
        );
    }

    const { rows: userRows } = await db.query(`SELECT id FROM users WHERE username = 'CSE-srkr' ORDER BY id ASC LIMIT 1`);
    const defaultUserId = userRows[0].id;
    console.log('Default user ID for existing data:', defaultUserId);

    console.log('3. Adding user_id column to tables...');
    await db.query(`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);
    await db.query(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);
    await db.query(`ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);
    await db.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);
    await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`);

    console.log('4. Assigning existing rows to default user...');
    await db.query(`UPDATE faculty SET user_id = $1 WHERE user_id IS NULL`, [defaultUserId]);
    await db.query(`UPDATE classrooms SET user_id = $1 WHERE user_id IS NULL`, [defaultUserId]);
    await db.query(`UPDATE exam_sessions SET user_id = $1 WHERE user_id IS NULL`, [defaultUserId]);
    await db.query(`UPDATE import_log SET user_id = $1 WHERE user_id IS NULL`, [defaultUserId]);
    await db.query(`UPDATE settings SET user_id = $1 WHERE user_id IS NULL`, [defaultUserId]);

    console.log('✔ Migration and seeding completed successfully!');
}

if (require.main === module) {
    runMigration().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = runMigration;
