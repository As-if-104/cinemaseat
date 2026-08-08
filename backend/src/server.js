const express = require("express");
const config = require("./config");

const healthRoutes = require("./routes/health.routes");
const catalogRoutes = require("./routes/catalog.routes");
const seatsRoutes = require("./routes/seats.routes");
const { startHoldExpiryWorker } = require("./workers/holdExpiryWorker");

const app = express();
app.use(express.json());
app.use("/health", healthRoutes);
app.use("/", catalogRoutes);
app.use("/showtimes", seatsRoutes);

app.listen(config.PORT, () => {
  console.log(`CinemaSeat backend listening on :${config.PORT}`);
  startHoldExpiryWorker();
});








