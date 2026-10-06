import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

const dbInstance = postgres<Contract>({
  contractJson,
  url: process.env["DATABASE_URL"]!
});

dbInstance
  .connect()
  .then(() => {
    console.log("Database has been connected");
  })
  .catch((err) => {
    console.error("Unable to connect database", err);
  });

export default dbInstance.orm.public;
