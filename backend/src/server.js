require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const fs = require('fs');
const db = require('./db');

const authRoutes = require('./routes/auth');
const facultyRoutes = require('./routes/faculty');
const classroomRoutes = require('./routes/classrooms');
const examRoutes = require('./routes/exams');
const allocationRoutes = require('./routes/allocation');
const uploadRoutes = require('./routes/upload');
const templateRoutes = require('./routes/templates');
const dutySheetRoutes = require('./routes/dutysheet');
const settingsRoutes = require('./routes/settings');

const app = express();

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const envOrigin = process.env.FRONTEND_ORIGIN;
        if (!envOrigin || envOrigin === 'true' || envOrigin === '*' || origin === envOrigin) {
            return callback(null, true);
        }
        if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('192.168.') || origin.includes('10.')) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    maxAge: 86400
}));
app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
    app.set('trust proxy', 1); // Trust first proxy (Render uses reverse proxies)
}

app.use(session({
    store: new pgSession({
        pool: db.pool, // Connection pool
        tableName: 'session' // DB table name
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
    },
}));

// Health check endpoint for server warm-up
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/allocation', allocationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/duty-sheet', dutySheetRoutes);
app.use('/api/settings', settingsRoutes);

// Serve the frontend (single static folder, deployed alongside backend)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
// Set efficient caching headers for static JS/CSS
app.use(express.static(frontendPath, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
    }
}));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

// Run database migrations on startup if not already initialized
async function startServer() {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await db.query(sql);

        // Explicitly guarantee all faculty and migration columns exist on boot
        await db.query('ALTER TABLE faculty ADD COLUMN IF NOT EXISTS serial_no INTEGER');
        await db.query('ALTER TABLE faculty ADD COLUMN IF NOT EXISTS shortcuts VARCHAR(200)');
        await db.query('ALTER TABLE faculty ADD COLUMN IF NOT EXISTS contact VARCHAR(50)');
        await db.query('ALTER TABLE faculty ADD COLUMN IF NOT EXISTS room_no VARCHAR(50)');
        await db.query('ALTER TABLE faculty ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
        await db.query('ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS required_invigilators INTEGER');
        await db.query('ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10)');
        await db.query('ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
        await db.query('ALTER TABLE faculty_timetable ADD COLUMN IF NOT EXISTS year_sem VARCHAR(10)');
        await db.query('ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
        await db.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
        await db.query('ALTER TABLE import_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');

        console.log('✔ Database schema & column migrations verified successfully.');

        app.listen(PORT, () => {
            console.log(`Invigilation system running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('✘ Failed to initialize database on startup:', err);
        process.exit(1);
    }
}

startServer();
