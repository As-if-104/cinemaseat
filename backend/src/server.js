const express = require("express");
const config = require("./config");
const healthRoutes = require("./routes/health.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const paymentsRoutes = require("./routes/payments.routes");
const otpRoutes = require("./routes/otp.routes");
const { startHoldSweeper } = require("./holdSweeper");

const app = express();

// Capture raw body for HMAC signature verification on webhooks.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health mounted first, never touches db/gateway — always green.
app.use("/health", healthRoutes);
app.use("/bookings", bookingsRoutes);
app.use("/", paymentsRoutes); // /bookings/:id/pay, /webhooks/payment
app.use("/", otpRoutes); // /bookings/:id/otp/*, /webhooks/otp

app.listen(config.PORT, () => {
  console.log(`CinemaSeat backend listening on :${config.PORT}`);
  startHoldSweeper();
});
