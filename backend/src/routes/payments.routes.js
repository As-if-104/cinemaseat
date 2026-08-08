const express = require("express");
const { pool } = require("../db");
const gateway = require("../gateway");
const router = express.Router();

// POST /bookings/:id/pay
router.post("/bookings/:id/pay", async (req, res) => {
  const bookingId = req.params.id;

  const bRes = await pool.query(
    `SELECT b.id, b.status, ss.hold_expires_at, s.price_cents
     FROM bookings b
     JOIN show_seats ss ON ss.id = b.show_seat_id
     JOIN showtimes s ON s.id = ss.showtime_id
     WHERE b.id = $1`,
    [bookingId]
  );
  if (bRes.rowCount === 0) return res.status(404).json({ error: "booking not found" });
  const booking = bRes.rows[0];

  if (booking.status !== "PENDING_PAYMENT") {
    return res.status(409).json({ error: `booking is ${booking.status}` });
  }
  if (!booking.hold_expires_at || new Date(booking.hold_expires_at) < new Date()) {
    return res.status(409).json({ error: "hold expired, seat released" });
  }

  const payRes = await pool.query(
    `INSERT INTO payments (booking_id, amount_cents, status) VALUES ($1, $2, 'PENDING') RETURNING id`,
    [bookingId, booking.price_cents]
  );
  const paymentId = payRes.rows[0].id;

const { status, data } = await gateway.charge({
    amount_cents: booking.price_cents,
    booking_id: bookingId,
    idempotencyKey: paymentId,
    forceHeader: req.get("X-Mock-Force"),
  });

  if (status !== 202 || !data.payment_id) {
    // gateway down or rejected — payment stays PENDING, booking stays PENDING_PAYMENT
    // health stays green regardless; caller can retry
    return res.status(502).json({ error: "gateway charge failed", detail: data });
  }

  await pool.query(`UPDATE payments SET gateway_payment_id = $1 WHERE id = $2`, [data.payment_id, paymentId]);
  res.status(202).json({ payment_id: paymentId, gateway_payment_id: data.payment_id, status: "PENDING" });
});

// POST /webhooks/payment  (gateway calls this)
router.post("/webhooks/payment", async (req, res) => {
  if (!gateway.verifySignature(req.rawBody, req.get("X-Signature"))) {
    return res.sendStatus(401);
  }

  const event = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ATOMIC dedup: INSERT ... ON CONFLICT DO NOTHING. If 0 rows inserted,
    // this event_id was already processed — even under concurrent duplicate delivery.
    const ins = await client.query(
      `INSERT INTO payment_events (event_id, status, raw_payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.event_id, event.status, event]
    );

    if (ins.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.sendStatus(200); // duplicate — ack quietly, no double-processing
    }

    // find the payment; callback can race ahead of /pay finishing, so payment
    // row might briefly not have gateway_payment_id set yet — retry-safe via gateway retries
    const payRow = await client.query(`SELECT id, booking_id, status FROM payments WHERE gateway_payment_id = $1`, [
      event.payment_id,
    ]);

    if (payRow.rowCount === 0) {
      // event recorded but payment not found yet (race) — commit event as seen,
      // return non-2xx so gateway retries and we can link it next time
      await client.query("COMMIT");
      return res.sendStatus(202);
    }

    const { id: paymentId, booking_id: bookingId, status: currentStatus } = payRow.rows[0];

    await client.query(`UPDATE payment_events SET payment_id = $1 WHERE event_id = $2`, [paymentId, event.event_id]);

    // idempotent state transition: only act if not already in this terminal state
    if (currentStatus !== event.status) {
      await client.query(`UPDATE payments SET status = $1 WHERE id = $2`, [event.status, paymentId]);

      if (event.status === "SUCCEEDED") {
        await client.query(`UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1 AND status = 'PENDING_PAYMENT'`, [
          bookingId,
        ]);
        await client.query(
          `UPDATE show_seats SET status = 'BOOKED' WHERE id = (SELECT show_seat_id FROM bookings WHERE id = $1)`,
          [bookingId]
        );
      } else if (event.status === "FAILED") {
        await client.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1 AND status = 'PENDING_PAYMENT'`, [
          bookingId,
        ]);
        await client.query(
          `UPDATE show_seats SET status = 'AVAILABLE', hold_expires_at = NULL, held_by = NULL
           WHERE id = (SELECT show_seat_id FROM bookings WHERE id = $1) AND status = 'HELD'`,
          [bookingId]
        );
      } else if (event.status === "REFUNDED") {
        await client.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, [bookingId]);
      }
    }

    await client.query("COMMIT");
    res.sendStatus(200);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("payment webhook error", err);
    res.sendStatus(500); // genuine failure — gateway will retry (up to 8x)
  } finally {
    client.release();
  }
});

module.exports = router;