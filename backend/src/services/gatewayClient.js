const config = require("../config");

async function charge({ amount, currency, bookingRef, idempotencyKey }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${config.GATEWAY_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        amount,
        currency,
        booking_ref: bookingRef,
        callback_url: `${config.PUBLIC_CALLBACK_BASE}/webhooks/payment`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    return { status: "CHARGE_CALL_FAILED", error: err.message };
  }
}

module.exports = { charge };
