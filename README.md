CinemaSeat

A cinema ticketing platform built for the Zero to Production Phase 2 hackathon. Focus: never sell the same seat twice, stay usable under a premiere-night traffic spike, and survive an intentionally unreliable payment/OTP gateway.

What works
Browse movies, theatres, showtimes
Live seat map per showtime
Hold a seat → create a booking → pay → webhook-confirmed booking
Atomic seat locking — zero oversell under concurrent demand (proven, see Scenario A below)
Automatic hold expiry — an abandoned hold releases the seat back to the pool (proven, see Scenario B below)
Non-blocking payment initiation against the provided mock gateway
Idempotent webhook handling — duplicate gateway callbacks do not double-confirm a booking or double-count revenue
HMAC signature verification on incoming webhooks
/health returns fast and does not depend on the gateway being up
What's not built yet
Admin portal (not required by the brief — data is pre-seeded)
Frontend UI (backend is fully testable via the API directly; see requests below)
AWS/Poridhi deployment (see Deployment section — in progress)
Scenario C (bonus breakpoint load test)
Architecture

A modular monolith: one deployable Node.js/Express service, one Postgres database as the single source of truth for seat state, talking to the provided mock payment/OTP gateway container.

Client
  │
  ▼
Backend (Express, modular monolith)
  ├─ Catalog module        — movies, theatres, showtimes (read-only)
  ├─ Seat & booking engine — atomic hold/confirm/expire logic
  ├─ Payment orchestrator  — non-blocking calls to /charge, /refund
  └─ Webhook handler       — idempotent callback processing, HMAC verification
  │
  ▼
Postgres (single source of truth)          Mock gateway (external, unreliable)

Why a monolith, not microservices: the one invariant that must never break is "at most one active hold/booking per seat," and that invariant is only cheap to guarantee inside a single transactional database. Splitting the seat engine into its own service would mean solving distributed consensus for that invariant under an 8-hour clock — real cost, no benefit at this scale. Full reasoning in DECISIONS.md.

Data model
movies, theatres, showtimes       — catalog, pre-seeded
seats                              — physical seat inventory per theatre
show_seats                         — per-showtime seat status (AVAILABLE / HELD / BOOKED)
                                      UNIQUE(showtime_id, seat_id) — this is what makes
                                      Scenario A pass
bookings                           — one row per booking attempt
payments                           — one row per payment attempt
payment_events                     — idempotency ledger, PRIMARY KEY(event_id)
Running locally

Requires Docker and Docker Compose. No other dependencies.

bash
git clone https://github.com/<your-username>/cinemaseat.git
cd cinemaseat
docker pull asifmahmoud414/mock-gateway:latest
docker compose up --build

The stack comes up with Postgres auto-seeded (movies/theatres/showtimes/seats), the mock gateway on :9000, and the API on :3000. No manual steps.

Verify:

bash
curl http://localhost:3000/health
The exact requests judges will use

Fetch the seat map for a showtime:

GET /showtimes/:showtimeId/seats

Example:

bash
curl http://localhost:3000/showtimes/33333333-3333-3333-3333-333333333333/seats

Hold a seat:

POST /showtimes/:showtimeId/seats/:seatId/hold
Content-Type: application/json

{ "userRef": "user-1" }

Example:

bash
curl -X POST http://localhost:3000/showtimes/33333333-3333-3333-3333-333333333333/seats/<seatId>/hold \
  -H "Content-Type: application/json" \
  -d '{"userRef":"user-1"}'

Other endpoints:

GET  /movies
GET  /theatres
GET  /showtimes
POST /bookings                       { "showSeatId": "...", "userRef": "..." }
POST /bookings/:id/pay
POST /webhooks/payment               (called by the gateway, not by clients)
GET  /health
Configuration

All read from environment variables — see .env.example.

Variable	Purpose
DATABASE_URL	Postgres connection string
GATEWAY_URL	Mock gateway base URL
GATEWAY_SECRET	Shared secret for HMAC webhook verification
PUBLIC_CALLBACK_BASE	Base URL the gateway calls back on — must be the docker-compose service name (http://api:3000), never localhost
HOLD_TTL_SECONDS	How long a hold lasts before auto-release. Judges can override this to a short value to watch a hold expire.
Proof: Scenario A — one seat, many buyers

100 concurrent hold requests fired at the same seat via scripts/scenarioA-loadtest.ps1.

Requests sent : 100
Successes     : 1
Rejections    : 99
Oversell      : PASS - zero oversell

Mechanism: a single atomic UPDATE show_seats SET status = 'HELD' ... WHERE status = 'AVAILABLE' inside a transaction. Postgres serializes concurrent updates on the same row — exactly one UPDATE affects a row, the other 99 see rowCount = 0 and are cleanly rejected with 409.

To reproduce:

bash
docker compose up -d
./scripts/scenarioA-loadtest.ps1
Proof: Scenario B — the abandoned hold

With HOLD_TTL_SECONDS=10:

Seat A4 held by user-A → success: true, holdExpiresAt ~10s out
Immediately after: seat map shows A4 as HELD
15 seconds later: seat map shows no seats in HELD state — A4 auto-released by the background hold-expiry worker
user-B holds the same seat → success: true — proving it's genuinely bookable again, not just a status-field change
Duplicate callback handling (idempotency)

payment_events.event_id is a primary key. The webhook handler does:

sql
INSERT INTO payment_events (event_id, ...) VALUES (...) ON CONFLICT (event_id) DO NOTHING

A duplicate delivery of the same event_id becomes a no-op after the first processing — the booking is not confirmed twice, the payment is not recorded twice. The handler always returns 200, even for a duplicate, per the gateway's retry-avoidance rule.

Deployment

(to be filled in once deployed — Poridhi VM / AWS, deployed URL here)

Tech stack

Node.js, Express, PostgreSQL, Docker Compose. See DECISIONS.md for why.