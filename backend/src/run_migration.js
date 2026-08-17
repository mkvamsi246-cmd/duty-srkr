// Applies a specific migration SQL file via Node.js/pg.
// Usage: node src/run_migration.js src/migrations/005_faculty_sno_shortcuts.sql

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('./db');

async function runMigration() {
    const sqlFile = process.argv[2];
    if (!sqlFile) {
        console.error('Usage: node src/run_migration.js <path/to/migration.sql>');
        process.exit(1);
    }
    const sqlPath = path.resolve(sqlFile);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`Applying: ${sqlPath}`);
    try {
        await db.query(sql);
        console.log('✔ Migration applied successfully.');
    } catch (err) {
        console.error('✘ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await db.pool.end();
    }
}

runMigration();
