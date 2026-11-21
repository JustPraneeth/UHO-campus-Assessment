const path = require("node:path");
const dotenv = require("dotenv");

function loadEnv() {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });
  dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });
}

module.exports = loadEnv;