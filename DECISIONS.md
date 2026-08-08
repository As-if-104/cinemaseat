Decisions

Three decisions we genuinely debated, what we chose, and what we gave up.

1. Modular monolith vs. microservices

Options considered:

Split into separate services per module (catalog service, booking service, payment service, etc.), communicating over HTTP/message queue.
One deployable service, internally divided into clean modules (catalog, seat & booking engine, payment orchestrator, webhook handler), sharing one database.

What we chose: modular monolith.

Why: the one invariant that absolutely cannot break is "at most one active hold/booking per seat," and that's cheapest to guarantee inside a single transactional database using a unique constraint plus an atomic conditional UPDATE. Splitting the seat-booking logic into its own network-separated service would mean either accepting eventual consistency (unacceptable — Scenario A requires zero oversell, not "eventually zero oversell") or building a distributed locking mechanism from scratch under an 8-hour clock. Given the hackathon explicitly states "splitting into services is a choice, not a requirement," and rewards being able to defend the choice you made, we kept everything in one deployable unit with clear internal module boundaries instead.

What we gave up: independent scaling of hot paths (e.g. scaling the seat-locking module separately from catalog browsing under load), independent deployability of each module, and the architectural story of "true" microservices that some judges might expect by default. We accepted this because none of those benefits materialize at hackathon scale, and the module boundaries inside the monolith already give us the same separation of concerns for code organization and reasoning purposes.

2. Postgres-only locking vs. Redis-backed locking

Options considered:

Redis SETNX (or similar) as a fast in-memory lock, with Postgres as the eventual source of truth.
Postgres alone: a unique constraint on (showtime_id, seat_id) plus an atomic UPDATE ... WHERE status = 'AVAILABLE' inside a transaction.

What we chose: Postgres alone.

Why: adding Redis introduces a second system that must stay consistent with Postgres — if the Redis lock succeeds but the Postgres write fails (or vice versa), we've introduced a new class of bug into the one path that must never be wrong. Postgres's row-level locking under a WHERE status = 'AVAILABLE' guard already gives us the correctness guarantee for free, with no additional infrastructure. Given our load-testing target was 100 concurrent requests (not 10,000+), Postgres alone comfortably handles the throughput.

What we gave up: at genuinely high scale, Redis would reduce load on the primary database for the hot "who gets this seat" check. We accepted this trade-off because at the traffic levels this system will actually be tested at, the added complexity and new failure mode (two systems to keep in sync) cost more than the performance headroom is worth.

3. Raw-body HMAC verification approach

Options considered:

Mount a separate express.raw() middleware scoped only to /webhooks/*, parse JSON manually inside the route handler after verifying the signature.
Use a single express.json({ verify: (req, res, buf) => { req.rawBody = buf } }) middleware globally, capturing the raw buffer alongside the parsed body for every request.

What we chose: the single global express.json({ verify }) approach.

Why: it avoids maintaining two separate body-parsing code paths (one for webhook routes, one for everything else), which reduces the chance of a route being wired to the wrong parser and silently breaking signature verification. It also means every route gets consistent JSON parsing behavior, and the webhook handler is one function among many, not a special case requiring its own middleware mount point in server.js.

What we gave up: capturing the raw body on every request has a small, constant memory/CPU overhead compared to only doing it on webhook routes — negligible at this scale, but a real trade-off at high request volume. We accepted it for the simplicity and reduced risk of misconfiguration.