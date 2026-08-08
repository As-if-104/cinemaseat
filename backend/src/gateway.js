const crypto = require("crypto");
const config = require("./config");

async function gatewayFetch(path, body, headers = {}) {
  try {
    const res = await fetch(`${config.GATEWAY_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    console.error("gateway unreachable:", err.message);
    return { status: 0, data: { error: "gateway_unreachable" } };
  }
}

function charge({ amount_cents, booking_id, idempotencyKey, forceHeader }) {
  const headers = {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (forceHeader) headers["X-Mock-Force"] = forceHeader;

  return gatewayFetch(
    "/charge",
    {
      amount: amount_cents,
      currency: "BDT",
      booking_ref: booking_id,
      callback_url: `${config.PUBLIC_CALLBACK_BASE}/webhooks/payment`,
    },
    headers
  );
}

function otpSend({ phone, booking_id }) {
  return gatewayFetch("/otp/send", {
    phone,
    ref: booking_id,
    callback_url: `${config.PUBLIC_CALLBACK_BASE}/webhooks/otp`,
  });
}

function otpVerify({ booking_id, code }) {
  return gatewayFetch("/otp/verify", { ref: booking_id, code });
}

function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader || !rawBody) return false;
  const expected = crypto.createHmac("sha256", config.GATEWAY_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { charge, otpSend, otpVerify, verifySignature };