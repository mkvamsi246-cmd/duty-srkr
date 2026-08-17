const { Pool, types } = require('pg');
require('dotenv').config();

// Parse DATE columns (oid 1082) as simple YYYY-MM-DD strings to avoid JS Date timezone shifting
types.setTypeParser(1082, val => val);

const isProd = process.env.NODE_ENV === 'production';

const poolConfig = {
    ...(process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: isProd ? { rejectUnauthorized: false } : false,
          }
        : {
            host: process.env.PGHOST,
            port: process.env.PGPORT,
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
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
