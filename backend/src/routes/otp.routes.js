const express = require("express");
const gateway = require("../gateway");
const router = express.Router();

router.post("/bookings/:id/otp/send", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone required" });

  const { status, data } = await gateway.otpSend({ phone, booking_id: req.params.id });
  if (status !== 202) return res.status(502).json({ error: "gateway otp send failed", detail: data });
  res.status(202).json({ status: "PENDING" });
});

router.post("/bookings/:id/otp/verify", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "code required" });

  const { status, data } = await gateway.otpVerify({ booking_id: req.params.id, code });
  if (status === 200 && data.verified) return res.json({ verified: true });
  if (status === 429) return res.status(429).json({ error: "too many attempts" });
  return res.status(400).json({ verified: false, detail: data });
});

router.post("/webhooks/otp", async (req, res) => {
  if (!gateway.verifySignature(req.rawBody, req.get("X-Signature"))) {
    return res.sendStatus(401);
  }
  console.log("OTP webhook:", req.body);
  res.sendStatus(200);
});

module.exports = router;