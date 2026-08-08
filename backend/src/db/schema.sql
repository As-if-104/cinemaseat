-- CinemaSeat schema
-- Note: the unique index at the bottom is what makes Scenario A pass.

CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  duration_minutes INT
);

CREATE TABLE IF NOT EXISTS theatres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT
);

-- Physical seats belonging to a theatre (static layout)
CREATE TABLE IF NOT EXISTS seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_id UUID NOT NULL REFERENCES theatres(id),
  row_label TEXT NOT NULL,
  seat_number INT NOT NULL,
  UNIQUE (theatre_id, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS showtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id),
  theatre_id UUID NOT NULL REFERENCES theatres(id),
  starts_at TIMESTAMPTZ NOT NULL,
  price_cents INT NOT NULL DEFAULT 45000
);

-- Per-showtime seat state. THIS is the table the race happens on.
CREATE TABLE IF NOT EXISTS show_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showtime_id UUID NOT NULL REFERENCES showtimes(id),
  seat_id UUID NOT NULL REFERENCES seats(id),
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','HELD','BOOKED')),
  hold_expires_at TIMESTAMPTZ,
  held_by TEXT,
  UNIQUE (showtime_id, seat_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_seat_id UUID NOT NULL REFERENCES show_seats(id),
  user_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  gateway_payment_id TEXT,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SUCCEEDED','FAILED','REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency ledger for gateway callbacks. event_id is the dedup key.
CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  payment_id UUID REFERENCES payments(id),
  status TEXT NOT NULL,
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE critical constraint: at most one row per (showtime, seat)
-- already enforced by UNIQUE(showtime_id, seat_id) on show_seats above.
-- Combined with a transactional UPDATE ... WHERE status = 'AVAILABLE',
-- this is what guarantees zero oversell under concurrent holds.

CREATE INDEX IF NOT EXISTS idx_show_seats_showtime ON show_seats(showtime_id);
CREATE INDEX IF NOT EXISTS idx_show_seats_hold_expiry ON show_seats(hold_expires_at)
  WHERE status = 'HELD';