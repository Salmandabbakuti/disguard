const { DataTypes } = require("sequelize");
const sequelize = require("../connector");

const schema = {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  guildId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  startChannelId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  roleId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rpcUrl: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  tokenAddress: {
    type: DataTypes.STRING,
    allowNull: false
  },
  minimumBalance: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  webhookUrl: {
    type: DataTypes.STRING,
    defaultValue: ""
  }
};

const ServerConfig = sequelize.define("ServerConfig", schema, {
  timestamps: true,
  freezeTableName: true
});

// Uncomment the following lines to create or update the ServerConfig table in the database
// ServerConfig.sync({ force: true })
//   .then(() => {
//     console.log("ServerConfig table has been created or updated");
//   })
//   .catch((error) => {
//     console.error("Error creating or updating ServerConfig table:", error);
//   });

module.exports = ServerConfig;
