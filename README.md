# Smart Invigilation System

Generates exam invigilation duty charts automatically based on:
- **Faculty type** (Professor / Associate Professor / Assistant Professor) and a configurable **priority order** between them
- **Duty-count fairness** — whoever has done the fewest duties so far is picked first within their priority tier
- **Their actual class/lab schedule that day** — a faculty member is never assigned to invigilate during a period where their weekly timetable already has them teaching a class or lab (hard conflict check), and among otherwise-equal candidates, whoever has fewer other classes/labs that day is preferred
- **Faculty availability** (mark specific dates/sessions off manually, e.g. leave)
- **Classroom capacity** — 1 invigilator per 24 students (configurable) per room

Data can be entered by hand in the UI, or bulk-imported from Excel (recommended) or PDF. Generated duty charts can be edited (reassign or cancel individual duties) and re-generated at any time, and exported as Excel or PDF.

---

## Department Login Credentials

The system provides multi-tenant data isolation per department. Every login has its own private workspace (faculty, weekly timetables, exam sessions, and duty sheets).

| Department | Username | Initial Password |
| :--- | :--- | :--- |
| **Mechanical Engineering** | `mech-srkr` | `mech@123` |
| **Computer Science & Engineering** | `CSE-srkr` | `cse@123` |
| **Civil Engineering** | `civil-srkr` | `civil@123` |
| **Electrical & Electronics Engineering** | `eee-srkr` | `eee@123` |
| **Electronics & Communication Engineering** | `ece-srkr` | `ece@123` |
| **Information Technology** | `it-srkr` | `it@123` |

*Note: You can change your password anytime in **Settings → Change Account Password**.*

---

## 1. Requirements

- Node.js 18+
- PostgreSQL 13+
- npm

## 2. Setup

```bash
# 1. Create the database
createdb invigilation_db

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure environment
cp .env.example .env
# edit .env: set PGUSER, PGPASSWORD, ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET

# 4. Apply the database schema
npm run migrate
# If you already set up this app before the timetable-conflict feature was
# added, run this once to add it without touching existing data:
# psql -d invigilation_db -f src/migrations/001_faculty_timetable.sql

# 5. Start the server
npm start
```

The app (frontend + API) is now served from **http://localhost:4000** — the backend serves the `frontend/` folder directly, so there's nothing separate to deploy or configure for the UI.

Log in using any of the department accounts (e.g. `CSE-srkr` / `cse@123`).

## 3. Deploying to a college server

This is a single Node.js process plus PostgreSQL — no separate frontend server, no build step, no Docker required (though it will work in one if you prefer).

1. Copy the whole `invigilation-system` folder to the server.
2. Install PostgreSQL if not already present, create the database, and run steps 2–4 above.
3. Run `npm start` behind a process manager, e.g.:
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name invigilation
   pm2 save
   pm2 startup
   ```
4. Put it behind your existing web server (Nginx/Apache) as a reverse proxy on port 4000, with HTTPS — or expose the port directly on your campus network.
5. In production, set `COOKIE_SECURE=true` in `.env` once HTTPS is in place.

## 4. Day-to-day usage

1. **Faculty** — add faculty individually, or bulk-upload via **Import Data** using `backend/templates/Faculty_Master_Template.xlsx` as your format.
2. **Classrooms** — same, using `Classroom_Master_Template.xlsx`.
3. **Faculty Weekly Timetable** — under **Import Data**, upload your "Individual Load" sheet directly (same format as `Timetables_Load_2026-27.xlsx` → "Individual Load" tab: one block per faculty with their name, a period-number header row, then Mon–Sat rows of class/lab codes). Import Faculty *before* this, since matching is by exact name. Re-uploading fully replaces each matched faculty member's timetable, so it's safe to re-run each semester.
4. **Exam Sessions** — create an exam session (name, date, FN/AN), then add the rooms being used and how many students sit in each — or bulk-upload with `Exam_Room_Allocation_Template.xlsx` (rooms must already exist under Classrooms first).
5. **Generate Duties** — pick the exam session and click **Generate Duty Chart**. The engine checks each candidate's timetable for that weekday and excludes anyone with a class/lab in the exam's period range (FN = periods 1–4, AN = periods 5–8 by default) before applying priority and fairness. Re-running it after edits is safe; it recalculates from scratch each time.
5. Reassign or cancel individual duties directly in the chart if needed — duty counts adjust automatically so fairness stays accurate for the next generation run.
6. **Settings** — reorder which designation gets picked first, and change the students-per-faculty ratio (default 24).
7. Export the final chart as Excel or PDF from the **Generate Duties** page.

## 5. Import file formats

Column headers are matched flexibly (case/spacing-insensitive, common variants accepted), but the templates in `backend/templates/` are the safest starting point:

- **Faculty**: Name, Designation, Department, Email, Phone
- **Classrooms**: Room No, Building, Capacity
- **Exam Room Allocation**: Exam Name, Date, Session, Room No, Students Count
- **Workload** (optional): any sheet with a "Faculty Name" and "Total" column — seeds starting duty counts from an existing workload tracker, matched by name. Useful the first time you set this up, so duty history doesn't reset to zero.
- **Faculty Weekly Timetable**: no separate template — upload the "Individual Load" sheet exactly as your college already produces it. The parser reads the repeating name → period-header → Mon-Sat block structure directly, so there's nothing to reformat.

PDF import is supported for simple faculty and classroom lists (one entry per line) but Excel is far more reliable — use it whenever you can.

## 6. Project structure

```
invigilation-system/
├── backend/
│   ├── src/
│   │   ├── server.js           Express app entry point
│   │   ├── db.js                PostgreSQL connection pool
│   │   ├── schema.sql            Full database schema
│   │   ├── migrate.js            Applies schema.sql
│   │   ├── routes/                API endpoints
│   │   ├── services/
│   │   │   ├── allocationEngine.js   Core duty-assignment logic
│   │   │   ├── importParser.js        Excel/PDF import parsing
│   │   │   └── exportService.js       Excel/PDF duty chart export
│   │   └── middleware/auth.js
│   └── templates/                Starter Excel files for imports
└── frontend/
    ├── index.html
    ├── css/style.css              White/black sidebar UI
    └── js/                         Vanilla JS, one file per screen
```

No frontend build step — it's plain HTML/CSS/JS, so there's nothing to compile and nothing to break between Node versions.

## 7. Extending later

- **Multi-user staff logins**: currently a single admin account (simple, no roles). To let staff log in individually, add a `password_hash` column to `faculty` and extend `middleware/auth.js`.
- **Email/SMS notifications** to faculty when duties are assigned: hook into `allocationEngine.generateDutiesForSession()`.
- **Consecutive-day fairness** (avoid same faculty on back-to-back days): extend the candidate sort in `allocationEngine.js`.
