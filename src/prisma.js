const { PrismaClient } = require("@prisma/client");
const { logger } = require("./utils.js");

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

prisma
  .$connect()
  .then(() => logger.info("Database has been connected"))
  .catch((err) => logger.error("Unable to connect database", err));

module.exports = prisma;
