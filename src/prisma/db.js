const postgres = require("@prisma/orm-postgres/runtime").default;
const contractJson = require("./contract.json");
const { DATABASE_URL } = require("../config");

const db = postgres({
  contractJson,
  url: DATABASE_URL
});

db.connect()
  .then(() => {
    console.log("Database has been connected");
  })
  .catch((err) => {
    console.error("Unable to connect database", err);
  });

module.exports = db;
