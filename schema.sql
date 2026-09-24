-- Run this once against your Neon database (see README.md for how).
-- Safe to re-run in full — every statement below is idempotent.

CREATE TABLE IF NOT EXISTS oil_grades (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automatic Transmission Fluid / CVT Fluid grades.
CREATE TABLE IF NOT EXISTS atf_cvt_grades (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Manual Transmission Oil grades.
CREATE TABLE IF NOT EXISTS manual_transmission_grades (
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
  oil_type TEXT,
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

-- If service_records already existed from an earlier version, this adds
-- the new column without touching your existing rows.
ALTER TABLE service_records ADD COLUMN IF NOT EXISTS oil_type TEXT;

-- Speeds up the number-plate search box and vehicle history lookups.
CREATE INDEX IF NOT EXISTS idx_service_records_plate ON service_records (plate);

