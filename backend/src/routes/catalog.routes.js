const express = require("express");
const { pool } = require("../db");
const router = express.Router();

router.get("/movies", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM movies ORDER BY title");
  res.json(rows);
});

router.get("/theatres", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM theatres ORDER BY name");
  res.json(rows);
});

router.get("/showtimes", async (req, res) => {
  const { movieId } = req.query;
  const { rows } = await pool.query(
    movieId
      ? "SELECT * FROM showtimes WHERE movie_id = $1 ORDER BY starts_at"
      : "SELECT * FROM showtimes ORDER BY starts_at",
    movieId ? [movieId] : [],
  );
  res.json(rows);
});

module.exports = router;
