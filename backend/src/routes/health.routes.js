const express = require("express");
const router = express.Router();

// Must ALWAYS return 200 as long as this process is alive.
// Never touch db or gateway here — that's the whole point of the requirement.
router.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = router;