const { pool } = require("../db");

const SWEEP_INTERVAL_MS = 5000;

async function sweepExpiredHolds() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query(
      `UPDATE show_seats
       SET status = 'AVAILABLE', hold_expires_at = NULL, held_by = NULL
       WHERE status = 'HELD' AND hold_expires_at < now()
       RETURNING id`,
    );
    if (expired.rowCount > 0) {
      console.log(`hold sweep: released ${expired.rowCount} seat(s)`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("hold sweep failed:", err.message);
  } finally {
    client.release();
  }
}

function startHoldExpiryWorker() {
  setInterval(sweepExpiredHolds, SWEEP_INTERVAL_MS);
  console.log(
    `hold expiry worker started (every ${SWEEP_INTERVAL_MS / 1000}s)`,
  );
}

module.exports = { startHoldExpiryWorker };
