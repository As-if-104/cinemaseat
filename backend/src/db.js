const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 50, // enough headroom for concurrency tests
});

module.exports = { pool };
