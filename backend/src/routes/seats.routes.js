const express = require("express");
const seatService = require("../services/seatService");
const router = express.Router();

router.get("/:showtimeId/seats", async (req, res) => {
  try {
    const seats = await seatService.getSeatMap(req.params.showtimeId);
    res.json(seats);
  } catch (err) {
    console.error("getSeatMap error", err);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/:showtimeId/seats/:seatId/hold", async (req, res) => {
  const { userRef } = req.body;
  if (!userRef) return res.status(400).json({ error: "userRef is required" });

  try {
    const result = await seatService.holdSeat({
      showtimeId: req.params.showtimeId,
      seatId: req.params.seatId,
      userRef,
    });

    if (!result.success) {
      return res.status(409).json({ error: "SEAT_UNAVAILABLE" });
    }
    res.status(200).json(result);
  } catch (err) {
    console.error("holdSeat error", err);
    res.status(500).json({ error: "internal error" });
  }
});

module.exports = router;
