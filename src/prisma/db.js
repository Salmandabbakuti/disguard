const postgres = require("@prisma/orm-postgres/runtime").default;
const contractJson = require("./contract.json");
const { logger } = require("../utils");
const { DATABASE_URL } = require("../config");

const db = postgres({
  contractJson,
  url: DATABASE_URL
});

db.connect()
  .then(() => {
    logger.info("Database has been connected");
  })
  .catch((err) => {
    logger.error("Unable to connect database", err);
  });

module.exports = db;
