const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../prisma/generated/client");
const { logger } = require("./utils");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});
const prisma = new PrismaClient({
  adapter,
  log: ["warn", "error"]
});

prisma
  .$connect()
  .then(() => logger.info("Database has been connected"))
  .catch((err) => logger.error("Unable to connect database", err));

module.exports = prisma;
