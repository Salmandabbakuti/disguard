import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  Model
} from "sequelize";
import sequelize from "../connector";

export class ServerConfig extends Model<
  InferAttributes<ServerConfig>,
  InferCreationAttributes<ServerConfig>
> {
  declare id: CreationOptional<number>;
  declare guildId: string;
  declare startChannelId: string;
  declare roleId: string;
  declare rpcUrl: string;
  declare tokenAddress: string;
  declare minimumBalance: number;
  declare webhookUrl: CreationOptional<string>;
}

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

ServerConfig.init(schema, {
  sequelize,
  modelName: "ServerConfig",
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

export default ServerConfig;
