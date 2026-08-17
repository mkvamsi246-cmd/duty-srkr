// Applies schema.sql to the configured PostgreSQL database.
// Run with: npm run migrate

const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Applying schema.sql to database...');
    try {
        await db.query(sql);
        console.log('✔ Schema applied successfully.');
    } catch (err) {
        console.error('✘ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await db.pool.end();
    }
}

migrate();
