-- Minimal seed data: one movie, one theatre, one showtime, a small grid of seats.
INSERT INTO movies (id, title, duration_minutes)
VALUES ('11111111-1111-1111-1111-111111111111', 'Spider-Man: Brand New Day', 140)
ON CONFLICT DO NOTHING;

INSERT INTO theatres (id, name, location)
VALUES ('22222222-2222-2222-2222-222222222222', 'CUET Cineplex', 'Chattogram')
ON CONFLICT DO NOTHING;

INSERT INTO showtimes (id, movie_id, theatre_id, starts_at, price_cents)
VALUES ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        now() + interval '1 day', 45000)
ON CONFLICT DO NOTHING;

-- 5 rows x 10 seats
DO $$
DECLARE
  r TEXT;
  n INT;
  v_seat_id UUID;
BEGIN
  FOREACH r IN ARRAY ARRAY['A','B','C','D','E'] LOOP
    FOR n IN 1..10 LOOP
      INSERT INTO seats (theatre_id, row_label, seat_number)
      VALUES ('22222222-2222-2222-2222-222222222222', r, n)
      ON CONFLICT (theatre_id, row_label, seat_number) DO NOTHING
      RETURNING id INTO v_seat_id;

      IF v_seat_id IS NOT NULL THEN
        INSERT INTO show_seats (showtime_id, seat_id, status)
        VALUES ('33333333-3333-3333-3333-333333333333', v_seat_id, 'AVAILABLE')
        ON CONFLICT (showtime_id, seat_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;