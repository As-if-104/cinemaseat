const express = require("express");
const config = require("./config");
const { startHoldExpiryWorker } = require("./workers/holdExpiryWorker");

const healthRoutes = require("./routes/health.routes");
const catalogRoutes = require("./routes/catalog.routes");
const seatsRoutes = require("./routes/seats.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const webhooksRoutes = require("./routes/webhooks.routes");

const app = express();

// Capture raw body for HMAC signature verification on webhooks.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use("/health", healthRoutes);
app.use("/", catalogRoutes);
app.use("/showtimes", seatsRoutes);
app.use("/bookings", bookingsRoutes);
app.use("/webhooks", webhooksRoutes);

app.listen(config.PORT, () => {
  console.log(`CinemaSeat backend listening on :${config.PORT}`);
  startHoldExpiryWorker();
});
