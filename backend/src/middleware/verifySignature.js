const crypto = require("crypto");
const config = require("../config");

function verifySignature(req, res, next) {
  const signature = req.get("X-Signature");
  const expected = crypto
    .createHmac("sha256", config.GATEWAY_SECRET)
    .update(req.rawBody)
    .digest("hex");

  if (signature !== expected) {
    return res.sendStatus(401);
  }
  next();
}

module.exports = verifySignature;
