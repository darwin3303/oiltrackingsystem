# Oil Change Tracker — Nandana Auto Electricals

Node.js/Express backend + Postgres (Neon) database, serving a static frontend
(search by number plate, light/dark mode, live backend/database status pill).

## 1. Set up the database on Neon

1. Go to https://neon.tech and sign in (or create a free account).
2. Create a new project (any region close to your Render service is fine).
3. Open the **SQL Editor** for that project.
4. Paste the entire contents of `schema.sql` from this project and run it.
   This creates the `oil_grades`, `technicians`, `vehicle_makes`, and
   `service_records` tables.
5. Go to **Connection Details** (or "Connect" on the project dashboard) and
   copy the connection string. It looks like:

   ```
   postgresql://user:password@ep-xxxx.aws.neon.tech/dbname?sslmode=require
   ```

   Keep this — you'll paste it into Render as `DATABASE_URL` in step 3 below.

## 2. Test locally (optional but recommended)

```bash
cd oil-app
npm install
cp .env.example .env
# edit .env and paste your Neon connection string into DATABASE_URL
npm start
```

Open http://localhost:3000 — you should see the app, with a green
"● Connected" pill in the header once it can reach Neon.

## 3. Deploy on Render

1. Push this project to a GitHub (or GitLab) repository. Render deploys from
   a repo — it does not accept a plain file upload for a web service.
2. Go to https://render.com, sign in, and click **New +** → **Web Service**.
3. Connect your GitHub account and select this repository.
4. Configure the service:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine to start.
5. Under **Environment Variables**, add:
   - `DATABASE_URL` → the Neon connection string from step 1.5 above.
   (Render sets `PORT` itself — you don't need to add it.)
6. Click **Create Web Service**. Render will build and deploy; when it's
   live you'll get a URL like `https://oil-change-tracker.onrender.com`.
7. Open that URL — the status pill in the header confirms the backend can
   reach your Neon database.

## Updating later

Any time you push a new commit to the connected branch, Render rebuilds and
redeploys automatically. Schema changes (e.g. a new column) need to be run
manually in Neon's SQL Editor — this project doesn't run migrations
automatically.

## Project structure

```
oil-app/
├── server.js          Express app + REST API + Postgres queries
├── package.json
├── schema.sql          Run once in Neon's SQL Editor
├── .env.example         Copy to .env for local development
└── public/
    ├── index.html
    ├── style.css        Light/dark theme variables
    ├── app.js           Search, theme toggle, status polling, all API calls
    └── logo.png
```

## API reference

| Method | Path                       | Purpose                                   |
|--------|-----------------------------|--------------------------------------------|
| GET    | /api/health                 | Used by the status pill                    |
| GET    | /api/records?search=PLATE   | List records, optionally filtered by plate |
| POST   | /api/records                | Create a record (next date/odometer auto)  |
| DELETE | /api/records/:id            | Delete a record                            |
| GET/POST/DELETE | /api/oil_grades, /api/technicians, /api/vehicle_makes | Manage dropdown lists |
| GET    | /api/summary/oil-grades     | Usage counts per oil grade                 |
