const express = require("express");
const { pool } = require("../db");
const { charge } = require("../services/gatewayClient");
const router = express.Router();

// Booking is created from an ALREADY-HELD seat (via /showtimes/.../hold).
// This route does not re-lock the seat, it just checks the hold is valid.
router.post("/", async (req, res) => {
  const { showSeatId, userRef } = req.body;
  if (!showSeatId || !userRef) {
    return res.status(400).json({ error: "showSeatId and userRef required" });
  }

  const check = await pool.query(
    `SELECT id FROM show_seats
     WHERE id = $1 AND status = 'HELD' AND held_by = $2 AND hold_expires_at > now()`,
    [showSeatId, userRef],
  );
  if (check.rowCount === 0) {
    return res
      .status(409)
      .json({ error: "seat not held by this user, or hold expired" });
  }

  const { rows } = await pool.query(
    `INSERT INTO bookings (show_seat_id, user_ref) VALUES ($1, $2) RETURNING *`,
    [showSeatId, userRef],
  );
  res.status(201).json(rows[0]);
});

// POST /bookings/:id/pay — must return immediately, never block on the gateway.
router.post("/:id/pay", async (req, res) => {
  const bookingId = req.params.id;

  const { rows } = await pool.query(
    `SELECT b.id, s.price_cents
       FROM bookings b
       JOIN show_seats ss ON ss.id = b.show_seat_id
       JOIN showtimes s ON s.id = ss.showtime_id
      WHERE b.id = $1`,
    [bookingId],
  );
  if (rows.length === 0)
    return res.status(404).json({ error: "booking not found" });

  const amountCents = rows[0].price_cents;

  await pool.query(
    `INSERT INTO payments (booking_id, amount_cents, status) VALUES ($1, $2, 'PENDING')`,
    [bookingId, amountCents],
  );

  charge({
    amount: amountCents,
    currency: "BDT",
    bookingRef: bookingId,
    idempotencyKey: bookingId,
  }).catch((err) => console.error("charge call error", err));

  res.status(202).json({ bookingId, status: "PAYMENT_PENDING" });
});

module.exports = router;
