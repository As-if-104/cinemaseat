const { pool } = require("../db");
const config = require("../config");

async function holdSeat({ showtimeId, seatId, userRef }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE show_seats
         SET status = 'HELD',
             held_by = $1,
             hold_expires_at = now() + ($2 || ' seconds')::interval
       WHERE showtime_id = $3
         AND seat_id = $4
         AND (status = 'AVAILABLE'
              OR (status = 'HELD' AND hold_expires_at < now()))
       RETURNING id, hold_expires_at`,
      [userRef, config.HOLD_TTL_SECONDS, showtimeId, seatId],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return { success: false, reason: "SEAT_UNAVAILABLE" };
    }

    await client.query("COMMIT");
    return {
      success: true,
      showSeatId: result.rows[0].id,
      holdExpiresAt: result.rows[0].hold_expires_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getSeatMap(showtimeId) {
  const { rows } = await pool.query(
    `SELECT ss.id AS show_seat_id, s.row_label, s.seat_number,
            ss.status,
            CASE WHEN ss.status = 'HELD' AND ss.hold_expires_at < now()
                 THEN 'AVAILABLE' ELSE ss.status END AS effective_status
       FROM show_seats ss
       JOIN seats s ON s.id = ss.seat_id
      WHERE ss.showtime_id = $1
      ORDER BY s.row_label, s.seat_number`,
    [showtimeId],
  );
  return rows;
}

async function releaseExpiredHolds() {
  const { rowCount } = await pool.query(
    `UPDATE show_seats
        SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
      WHERE status = 'HELD' AND hold_expires_at < now()`,
  );
  return rowCount;
}

module.exports = { holdSeat, getSeatMap, releaseExpiredHolds };
