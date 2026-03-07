-- ============================================================
-- Batutynas Business Automation — Database Schema
-- Runs on the existing Chatwoot PostgreSQL instance
-- Schema: batutynas (isolated from Chatwoot's public schema)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS batutynas;

-- -----------------------------------------------------------
-- 1. Contacts
-- -----------------------------------------------------------
CREATE TABLE batutynas.contacts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  source        TEXT NOT NULL DEFAULT 'Phone'
                CHECK (source IN ('Facebook','Website','Phone','Referral','Chatbot','Telegram')),
  first_booking_date DATE,
  total_bookings     INTEGER NOT NULL DEFAULT 0,
  total_spent        NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_booking_date  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phone is the primary duplicate-detection key
CREATE UNIQUE INDEX idx_contacts_phone ON batutynas.contacts (phone);
CREATE INDEX idx_contacts_name ON batutynas.contacts (name);

-- -----------------------------------------------------------
-- 2. Equipment (replaces "Trampolines" — more accurate name)
-- -----------------------------------------------------------
CREATE TABLE batutynas.equipment (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  icon          TEXT,
  category      TEXT NOT NULL
                CHECK (category IN ('big-park','mega-trampoline','standard-trampoline','addon','party-equipment')),
  size_label    TEXT,          -- e.g. "14x16 m", "8x5 m"
  capacity      TEXT,          -- e.g. "Iki 12 vaikų", "360 dalyvių/val."
  min_guests    INTEGER DEFAULT 1,
  max_guests    INTEGER DEFAULT 999,
  age_range     TEXT,          -- e.g. "4–14 m."
  setup_time    TEXT,          -- e.g. "~25 min"
  detail        TEXT,          -- full description
  price         NUMERIC(10,2), -- NULL = "pagal užklausą"
  price_label   TEXT DEFAULT 'pagal užklausą',
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'Available'
                CHECK (status IN ('Available','Reserved','Rented','In Transit','Needs Cleaning','Damaged')),
  condition     TEXT NOT NULL DEFAULT 'Good'
                CHECK (condition IN ('Good','Minor Wear','Needs Repair')),
  purchase_date DATE,
  last_cleaned  DATE,
  popular       BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_equipment_category ON batutynas.equipment (category);
CREATE INDEX idx_equipment_status ON batutynas.equipment (status);

-- -----------------------------------------------------------
-- 3. Bookings
-- -----------------------------------------------------------
CREATE TABLE batutynas.bookings (
  id              SERIAL PRIMARY KEY,
  contact_id      INTEGER NOT NULL REFERENCES batutynas.contacts(id) ON DELETE RESTRICT,
  event_date      DATE NOT NULL,
  event_time      TIME,
  pickup_time     TIME,
  delivery_address TEXT,
  city            TEXT,
  status          TEXT NOT NULL DEFAULT 'Inquiry'
                  CHECK (status IN ('Inquiry','Confirmed','Delivered','Completed','Cancelled')),
  price           NUMERIC(10,2),
  deposit_amount  NUMERIC(10,2),
  deposit_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  payment_status  TEXT NOT NULL DEFAULT 'Unpaid'
                  CHECK (payment_status IN ('Unpaid','Deposit Paid','Paid in Full')),
  entry_source    TEXT NOT NULL DEFAULT 'Phone'
                  CHECK (entry_source IN ('Chatbot','Telegram','Direct Facebook','Phone')),
  confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  review_requested  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Section 14.2: Conversion tracking
  converted_from_inquiry BOOLEAN NOT NULL DEFAULT FALSE,
  inquiry_lost_reason    TEXT
                         CHECK (inquiry_lost_reason IS NULL OR
                                inquiry_lost_reason IN ('Price','Availability','No Response','Other')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_event_date ON batutynas.bookings (event_date);
CREATE INDEX idx_bookings_contact ON batutynas.bookings (contact_id);
CREATE INDEX idx_bookings_status ON batutynas.bookings (status);
CREATE INDEX idx_bookings_date_status ON batutynas.bookings (event_date, status);

-- -----------------------------------------------------------
-- 4. Booking_Equipment (junction: 1 booking → N equipment)
-- -----------------------------------------------------------
CREATE TABLE batutynas.booking_equipment (
  id              SERIAL PRIMARY KEY,
  booking_id      INTEGER NOT NULL REFERENCES batutynas.bookings(id) ON DELETE CASCADE,
  equipment_id    INTEGER NOT NULL REFERENCES batutynas.equipment(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, equipment_id)
);

CREATE INDEX idx_be_booking ON batutynas.booking_equipment (booking_id);
CREATE INDEX idx_be_equipment ON batutynas.booking_equipment (equipment_id);

-- -----------------------------------------------------------
-- Auto-update updated_at on bookings
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION batutynas.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_updated
  BEFORE UPDATE ON batutynas.bookings
  FOR EACH ROW EXECUTE FUNCTION batutynas.update_timestamp();

-- -----------------------------------------------------------
-- View: Today's schedule (used by morning briefing)
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW batutynas.v_today_schedule AS
SELECT
  b.id AS booking_id,
  c.name AS customer_name,
  c.phone AS customer_phone,
  b.event_time,
  b.pickup_time,
  b.delivery_address,
  b.city,
  b.status,
  b.price,
  b.deposit_paid,
  b.payment_status,
  ARRAY_AGG(e.name ORDER BY e.name) AS equipment_names,
  ARRAY_AGG(e.icon ORDER BY e.name) AS equipment_icons
FROM batutynas.bookings b
JOIN batutynas.contacts c ON c.id = b.contact_id
LEFT JOIN batutynas.booking_equipment be ON be.booking_id = b.id
LEFT JOIN batutynas.equipment e ON e.id = be.equipment_id
WHERE b.event_date = CURRENT_DATE
  AND b.status NOT IN ('Cancelled')
GROUP BY b.id, c.name, c.phone, b.event_time, b.pickup_time,
         b.delivery_address, b.city, b.status, b.price,
         b.deposit_paid, b.payment_status
ORDER BY b.event_time;

-- -----------------------------------------------------------
-- View: Weekly revenue comparison (for BI morning brief)
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW batutynas.v_weekly_revenue AS
SELECT
  SUM(CASE WHEN event_date BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
           THEN price ELSE 0 END) AS this_week_revenue,
  COUNT(CASE WHEN event_date BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
             AND status = 'Completed' THEN 1 END) AS this_week_bookings,
  SUM(CASE WHEN event_date BETWEEN CURRENT_DATE - INTERVAL '13 days' AND CURRENT_DATE - INTERVAL '7 days'
           THEN price ELSE 0 END) AS last_week_revenue,
  COUNT(CASE WHEN event_date BETWEEN CURRENT_DATE - INTERVAL '13 days' AND CURRENT_DATE - INTERVAL '7 days'
             AND status = 'Completed' THEN 1 END) AS last_week_bookings
FROM batutynas.bookings
WHERE status IN ('Completed','Delivered','Confirmed');

-- -----------------------------------------------------------
-- View: Equipment availability for a given date
-- (query with: WHERE event_date = '2026-07-03')
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW batutynas.v_equipment_availability AS
SELECT
  e.id,
  e.name,
  e.category,
  e.status AS current_status,
  e.size_label,
  e.capacity,
  CASE
    WHEN e.status != 'Available' THEN FALSE
    WHEN EXISTS (
      SELECT 1 FROM batutynas.booking_equipment be
      JOIN batutynas.bookings b ON b.id = be.booking_id
      WHERE be.equipment_id = e.id
        AND b.event_date = CURRENT_DATE
        AND b.status IN ('Confirmed','Delivered')
    ) THEN FALSE
    ELSE TRUE
  END AS available_today
FROM batutynas.equipment e;
