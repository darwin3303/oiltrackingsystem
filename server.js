require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it as an environment variable (see .env.example).');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon
});

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// ---------- Health check (used by the frontend's connection status pill) ----------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---------- Generic helpers for the three lookup lists ----------
function listRoutes(table) {
  app.get(`/api/${table}`, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY name ASC`);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`/api/${table}`, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO ${table} (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING RETURNING *`,
        [name.trim()]
      );
      res.status(201).json(rows[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`/api/${table}/:id`, async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

listRoutes('oil_grades');
listRoutes('technicians');
listRoutes('vehicle_makes');

// ---------- Service records ----------

// GET /api/records?search=ABC-1234  -> searches by number plate (partial, case-insensitive)
app.get('/api/records', async (req, res) => {
  const { search } = req.query;
  try {
    let result;
    if (search && search.trim()) {
      result = await pool.query(
        `SELECT * FROM service_records WHERE plate ILIKE $1 ORDER BY service_date DESC, id DESC`,
        [`%${search.trim()}%`]
      );
    } else {
      result = await pool.query(`SELECT * FROM service_records ORDER BY service_date DESC, id DESC`);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/records', async (req, res) => {
  const r = req.body;
  if (!r.plate || !r.service_date || r.odometer === undefined || r.odometer === null) {
    return res.status(400).json({ error: 'plate, service_date and odometer are required' });
  }
  try {
    const nextServiceDate = addMonths(r.service_date, 6);
    const nextOdometer = Number(r.odometer) + 5000;
    const { rows } = await pool.query(
      `INSERT INTO service_records
        (plate, customer_name, customer_phone, vehicle_make, vehicle_model,
         service_date, odometer, oil_grade, oil_qty, technician,
         comp_oil_filter, comp_cabin_filter, comp_engine_filter,
         next_service_date, next_odometer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        r.plate, r.customer_name || null, r.customer_phone || null,
        r.vehicle_make || null, r.vehicle_model || null,
        r.service_date, r.odometer, r.oil_grade || null, r.oil_qty ?? null, r.technician || null,
        !!r.comp_oil_filter, !!r.comp_cabin_filter, !!r.comp_engine_filter,
        nextServiceDate, nextOdometer,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM service_records WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Reminders: vehicles due for an oil change within 7 days (or overdue) ----------
app.get('/api/reminders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM service_records
       WHERE next_service_date <= (CURRENT_DATE + INTERVAL '7 days')
       ORDER BY next_service_date ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Summary: oil grade usage counts ----------
app.get('/api/summary/oil-grades', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT oil_grade AS name, COUNT(*) AS count, COALESCE(SUM(oil_qty), 0) AS total_qty
       FROM service_records
       WHERE oil_grade IS NOT NULL AND oil_grade <> ''
       GROUP BY oil_grade
       ORDER BY count DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Oil change tracker running on port ${PORT}`));
