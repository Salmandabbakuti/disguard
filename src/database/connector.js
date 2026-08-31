const { Sequelize } = require("sequelize");
const { DATABASE_URL } = require("../config");

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres"
});

sequelize
  .authenticate()
  .then(() => {
    console.log("Database has been connected");
  })
  .catch((error) => {
    console.error("Unable to connect to the database:", error);
  });

module.exports = sequelize;
