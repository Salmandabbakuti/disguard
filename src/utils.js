const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes
} = require("discord.js");
const fetch = require("node-fetch");
const { createLogger, format, transports } = require("winston");
const {
  DISCORD_BOT_TOKEN,
  DISCORD_BOT_APPLICATION_ID,
  LOG_LEVEL
} = require("./config");

// Construct and prepare an instance of the Discord REST module
const rest = new REST().setToken(DISCORD_BOT_TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel]
});

client.login(DISCORD_BOT_TOKEN);

const { combine, timestamp, printf, colorize, errors } = format;

// Log format
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const extraArgsArr = meta[Symbol.for("splat")];
  const extraArgs = extraArgsArr
    ?.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg)) // Handle objects and other types
    .join(" ");
  return `${timestamp} [${level}]: ${message} ${extraArgs || ""}`;
});

// Logger configuration
const logger = createLogger({
  level: LOG_LEVEL || "info",
  format: combine(
    errors({ stack: true }),
    colorize(),
    timestamp({
      format: "MMM D YYYY hh:mm:ss A"
    }),
    logFormat
  ),
  transports: [new transports.Console()]
});

// Guild commands to deploy
const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
    async execute(interaction) {
      await interaction.reply("Pong!");
    }
  },
  {
    name: "verify",
    description: "Verify your wallet to access gated channels"
  },
  {
    name: "get-serverconfig",
    description: "Get server settings for verification/gating"
  },
  {
    name: "set-serverconfig",
    description: "Configure server settings for verification/gating by admin",
    options: [
      {
        name: "rpcurl",
        description: "RPC URL of the blockchain network",
        type: 3,
        required: true
      },
      {
        name: "tokenaddress",
        description: "Contract address of ERC20/721 token for gating access",
        type: 3,
        required: true
      },
      {
        name: "minimumbalance",
        description: "Required minimum balance to assign gated role",
        type: 4,
        required: true
      },
      {
        name: "startchannel",
        description: "Channel to receive informational messages from bot",
        type: 7,
        required: true
      },
      {
        name: "role",
        description: "Role to assign to verified users",
        type: 8,
        required: true
      },
      {
        name: "webhookurl",
        description:
          "Discord channel Webhook URL to post critical messages to server admins",
        type: 3,
        required: false
      }
    ]
  }
];

// Deploys the cmmands to given guild
const deployCommands = (guildId) => {
  logger.info(
    `Started deploying ${commands.length} application (/) commands on guild ${guildId}.`
  );
  // The put method is used to fully refresh all commands in the guild with the current set
  rest
    .put(Routes.applicationGuildCommands(DISCORD_BOT_APPLICATION_ID, guildId), {
      body: commands
    })
    .then((res) =>
      logger.info(
        `Successfully deployed ${res.length} application (/) commands.`
      )
    )
    .catch((err) =>
      logger.error(`Failed to deploy application (/) commands: ${err.message}`)
    );
};

// Posts data to the provided webhook URL if provided
const postDataToWebhook = (webhookUrl, data) => {
  if (!webhookUrl)
    return logger.warn(
      "Webhook URL is not provided. Skipping posting data to webhook."
    );
  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
    .then((res) => {
      if (!res.ok) {
        logger.error(
          `Failed to post data to webhook: ${res.status} - ${res.statusText}`
        );
        return;
      }
      logger.info("Data posted to webhook successfully");
    })
    .catch((err) => logger.error("Error while posting data to webhook", err));
};

module.exports = {
  client,
  deployCommands,
  logger,
  postDataToWebhook
};
