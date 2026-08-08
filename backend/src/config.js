module.exports = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  GATEWAY_URL: process.env.GATEWAY_URL || "http://gateway:9000",
  GATEWAY_SECRET: process.env.GATEWAY_SECRET || "z2p-2026-secret",
  PUBLIC_CALLBACK_BASE: process.env.PUBLIC_CALLBACK_BASE || "http://api:3000",
  HOLD_TTL_SECONDS: process.env.HOLD_TTL_SECONDS || "120",
};
