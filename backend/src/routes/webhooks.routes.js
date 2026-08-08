const express = require("express");
const { pool } = require("../db");
const verifySignature = require("../middleware/verifySignature");

const router = express.Router();

router.post("/payment", verifySignature, async (req, res) => {
  const { event_id, payment_id, booking_ref, status } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // IDEMPOTENCY CHECK: event_id is PRIMARY KEY on payment_events.
    // ON CONFLICT DO NOTHING means a duplicate delivery becomes a no-op.
    const inserted = await client.query(
      `INSERT INTO payment_events (event_id, gateway_payment_id, status, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event_id, payment_id, status, req.body],
    );

    if (inserted.rowCount === 0) {
      // Already processed this exact event_id before — do nothing further.
      await client.query("ROLLBACK");
      return res.sendStatus(200); // still 2xx, per gateway spec rule 1
    }

    // First time seeing this event — apply the state transition.
    if (status === "SUCCEEDED") {
      const payment = await client.query(
        `UPDATE payments SET status = 'SUCCEEDED', gateway_payment_id = $1
          WHERE booking_id = $2::uuid RETURNING booking_id`,
        [payment_id, booking_ref],
      );
      if (payment.rowCount > 0) {
        await client.query(
          `UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1`,
          [payment.rows[0].booking_id],
        );
        await client.query(
          `UPDATE show_seats SET status = 'BOOKED'
             WHERE id = (SELECT show_seat_id FROM bookings WHERE id = $1)`,
          [payment.rows[0].booking_id],
        );
      }
    } else if (status === "FAILED") {
      await client.query(
        `UPDATE payments SET status = 'FAILED' WHERE booking_id = $1::uuid`,
        [booking_ref],
      );
      await client.query(
        `UPDATE show_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
           WHERE id = (SELECT show_seat_id FROM bookings WHERE id::text = $1)`,
        [booking_ref],
      );
    } else if (status === "REFUNDED") {
      await client.query(
        `UPDATE payments SET status = 'REFUNDED' WHERE booking_id = $1::uuid`,
        [booking_ref],
      );
    }

    await client.query("COMMIT");
    return res.sendStatus(200);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("webhook processing failed", err);
    return res.sendStatus(200); // never trigger gateway retry storm on our bug
  } finally {
    client.release();
  }
});

module.exports = router;
