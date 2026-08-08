const express = require("express");
const seatService = require("../services/seatService");
const router = express.Router();

router.get("/:showtimeId/seats", async (req, res) => {
  const seats = await seatService.getSeatMap(req.params.showtimeId);
  res.json(seats);
});

router.post("/:showtimeId/seats/:seatId/hold", async (req, res) => {
  const { userRef } = req.body;
  if (!userRef) return res.status(400).json({ error: "userRef is required" });

  const result = await seatService.holdSeat({
    showtimeId: req.params.showtimeId,
    seatId: req.params.seatId,
    userRef,
  });

  if (!result.success) {
    return res.status(409).json({ error: "SEAT_UNAVAILABLE" });
  }
  res.status(200).json(result);
});

module.exports = router;
