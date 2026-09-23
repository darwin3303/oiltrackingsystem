-- Run this once against your Neon database (see README.md for how).

CREATE TABLE IF NOT EXISTS oil_grades (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS technicians (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_makes (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_records (
  id SERIAL PRIMARY KEY,
  plate TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  service_date DATE NOT NULL,
  odometer INTEGER NOT NULL,
  oil_grade TEXT,
  oil_qty NUMERIC(5,2),
  technician TEXT,
  comp_oil_filter BOOLEAN DEFAULT false,
  comp_cabin_filter BOOLEAN DEFAULT false,
  comp_engine_filter BOOLEAN DEFAULT false,
  next_service_date DATE,
  next_odometer INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up the number-plate search box.
CREATE INDEX IF NOT EXISTS idx_service_records_plate ON service_records (plate);
