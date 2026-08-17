const { Pool, types } = require('pg');
require('dotenv').config();

// Parse DATE columns (oid 1082) as simple YYYY-MM-DD strings to avoid JS Date timezone shifting
types.setTypeParser(1082, val => val);

const isProd = process.env.NODE_ENV === 'production';

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URl;

if (isProd && !databaseUrl && !process.env.PGHOST) {
    const envKeys = Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('NODE_'));
    console.warn('⚠️ WARNING: Neither DATABASE_URL nor PGHOST environment variable is defined!');
    console.warn('Available env variables in process.env:', envKeys.join(', '));
    console.warn('The server will attempt connecting to localhost:5432.');
}

const poolConfig = {
    ...(databaseUrl
        ? {
            connectionString: databaseUrl,
            ssl: (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1'))
                ? false
                : (isProd ? { rejectUnauthorized: false } : false),
          }
        : {
            host: process.env.PGHOST || '127.0.0.1',
            port: process.env.PGPORT || 5432,
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            ssl: isProd && process.env.PGHOST && !process.env.PGHOST.includes('localhost') && !process.env.PGHOST.includes('127.0.0.1')
                ? { rejectUnauthorized: false }
                : false,
          }),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool,
};
