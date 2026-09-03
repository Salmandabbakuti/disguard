const config = {
  DATABASE_URL: process.env.DATABASE_URL!,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
  DISCORD_BOT_APPLICATION_ID: process.env.DISCORD_BOT_APPLICATION_ID!,
  APP_URL: process.env.APP_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  LOG_LEVEL: process.env.LOG_LEVEL!
};

export default config;
