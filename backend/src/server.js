const express = require("express");
const config = require("./config");

const healthRoutes = require("./routes/health.routes");

const app = express();
app.use(express.json());
app.use("/health", healthRoutes);

app.listen(config.PORT, () => {
  console.log(`CinemaSeat backend listening on :${config.PORT}`);
});
