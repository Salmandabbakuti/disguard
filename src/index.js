const {
  Events,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const {
  isAddress,
  JsonRpcProvider
} = require("ethers");
const jwt = require("jsonwebtoken");
const db = require("./prisma/db");
const { client, deployCommands, logger, postDataToWebhook } = require("./utils");
const app = require("./app");

const { APP_URL, JWT_SECRET } = require("./config");

// Event listeners for the Discord bot
client.once(Events.ClientReady, () =>
  logger.info(`Logged in as ${client.user.tag}`)
);

client.on(Events.GuildCreate, (guild) => {
  logger.info("Bot added to guild:", guild.name);
  //deploy slash commands on the joined guild
  deployCommands(guild.id);
});

client.on(Events.GuildDelete, (guild) => {
  logger.info("Bot removed from guild:", guild.name);
  //delete the guild from the db
  db.orm.public.ServerConfig.where({ guildId: guild.id })
    .delete()
    .catch((err) => {
      logger.error("Failed to delete server config", err);
    });
});

client.on(Events.GuildMemberAdd, async (member) => {
  logger.info(`${member.user.tag} joined the server: ${member.guild.name}`);
  //get starthere channel from server config table
  const serverConfig = await db.orm.public.ServerConfig.where({
    guildId: member.guild.id
  }).first();
  if (!serverConfig) {
    logger.warn(
      `Server not configured for ${member.guild.name}. Skipping welcome message for new joiner.`
    );
    return;
  }
  const startHereChannel = member.guild.channels.cache.get(
    serverConfig.startChannelId
  );
  if (!startHereChannel) {
    logger.warn(
      `Configured start channel not found for ${member.guild.name}. Skipping welcome message for new joiner.`
    );
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Configured start channel not found for ${member.guild.name} welcome messages!`
    });
    return;
  }

  startHereChannel.send({
    content: `Welcome, <@${member.id}>. We hope you brought pizza! Please type \`/verify\` command to verify your wallet and get access to our exclusive channels and perks!`
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  logger.info(`${member.user.tag} left the server: ${member.guild.name}`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || msg.system || msg.channel.type === "DM") return;
  logger.info(
    `Message received in ${msg.guild.name} from ${msg.author.tag}: ${msg.content}`
  );

  const serverConfig = await db.orm.public.ServerConfig.where({
    guildId: msg.guild.id
  }).first();

  if (!serverConfig)
    return msg.reply(
      "Server not configured. If you are an admin, please configure the server with `/set-serverconfig` command"
    );

  if (msg.channelId !== serverConfig.startChannelId) return;
  const possibleCommands = [
    "/ping",
    "/verify",
    "/set-serverconfig",
    "/get-serverconfig"
  ].join(", ");
  msg.reply(
    `I don't know what you mean. I can only respond to the following commands: ${possibleCommands}`
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  logger.info(
    `Interaction /${interaction.commandName} received in ${interaction.guild.name} from ${interaction.user.tag}`
  );

  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case "ping":
      await handlePingCommand(interaction);
      break;
    case "set-serverconfig":
      await handleSetServerConfig(interaction);
      break;
    case "get-serverconfig":
      await handleGetServerConfig(interaction);
      break;
    case "verify":
      await handleVerifyCommand(interaction);
      break;
    default:
      interaction.reply({
        content: "Unknown command",
        flags: MessageFlags.Ephemeral
      });
      break;
  }
});

async function handlePingCommand(interaction) {
  await interaction.reply({
    content: "pong!",
    flags: MessageFlags.Ephemeral
  });
}

async function handleSetServerConfig(interaction) {
  const {
    rpcUrl,
    tokenAddress,
    webhookUrl,
    minimumBalance,
    startChannelId,
    roleId
  } = getConfigOptions(interaction);

  // acknowledge the command and defer the reply to give time for processing
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!isServerOwner(interaction)) {
    return sendEphemeralReply(
      interaction,
      "You are not authorized to configure the server."
    );
  }

  if (!isAddress(tokenAddress)) {
    return sendEphemeralReply(interaction, "Invalid token address");
  }

  if (
    webhookUrl &&
    !webhookUrl.startsWith("https://discord.com/api/webhooks/")
  ) {
    return sendEphemeralReply(
      interaction,
      "Invalid discord webhook URL. It should start with `https://discord.com/api/webhooks/`"
    );
  }

  const serverConfig = {
    rpcUrl,
    tokenAddress,
    minimumBalance,
    startChannelId,
    roleId,
    webhookUrl
  };

  try {
    await saveServerConfig(interaction.guildId, serverConfig);
    const savedServerConfigSettings = await getServerConfigSettings(
      serverConfig,
      true
    );
    const outro =
      "Server members can now use `/verify` command to verify their wallet and get gated role which gives access to exclusive channels and perks!";

    const message =
      "Server configured successfully. Here are the settings:\n\n" +
      savedServerConfigSettings.join("\n") +
      "\n\n" +
      outro;

    await interaction.editReply({
      content: message,
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    logger.error("Failed to save server config", err);
    sendEphemeralReply(
      interaction,
      "Failed to save server config. Please try again later."
    );
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while setting server config: ${err}`
    });
  }
}

async function handleGetServerConfig(interaction) {
  // acknowledge the command and defer the reply to give time for processing
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const serverConfig = await db.orm.public.ServerConfig.where({
    guildId: interaction.guildId
  }).first();

  if (!serverConfig) {
    return sendEphemeralReply(
      interaction,
      "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
    );
  }
  try {
    const isOwner = isServerOwner(interaction);
    const serverConfigSettings = await getServerConfigSettings(
      serverConfig,
      isOwner
    );

    const message =
      "Here are the server's current configuration settings:\n\n" +
      serverConfigSettings.join("\n");
    await interaction.editReply({
      content: message,
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    logger.error("Failed to get server config", err);
    sendEphemeralReply(
      interaction,
      "Failed to get server config. Please try again later."
    );
    // send error message to webhook if available
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while getting server config: ${err}`
    });
  }
}

async function handleVerifyCommand(interaction) {
  // acknowledge the command and defer the reply to give time for processing
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const serverConfig = await db.orm.public.ServerConfig.where({
    guildId: interaction.guildId
  }).first();
  if (!serverConfig) {
    return sendEphemeralReply(
      interaction,
      "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
    );
  }

  try {
    const jwtToken = jwt.sign(
      {
        configId: serverConfig.id,
        guildId: interaction.guildId,
        memberId: interaction.member.id
      },
      JWT_SECRET,
      { expiresIn: "5m" } // 5 minutes
    );
    await sendVerifyCommandReply(interaction, serverConfig, jwtToken);
  } catch (err) {
    logger.error("Failed to handle verify command", err);
    sendEphemeralReply(
      interaction,
      "Failed to send verification request. Please try again later."
    );
    // send error message to webhook if available
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while handling verify command: ${err}`
    });
  }
}

// handler utils
function getConfigOptions(interaction) {
  return {
    rpcUrl: interaction.options.getString("rpcurl"),
    tokenAddress: interaction.options.getString("tokenaddress"),
    webhookUrl: interaction.options.getString("webhookurl"),
    minimumBalance: interaction.options.getInteger("minimumbalance"),
    startChannelId: interaction.options.getChannel("startchannel").id,
    roleId: interaction.options.getRole("role").id
  };
}

function isServerOwner(interaction) {
  return interaction.member.user.id === interaction.guild.ownerId;
}

function sendEphemeralReply(interaction, message) {
  return interaction.editReply({
    content: message,
    flags: MessageFlags.Ephemeral
  });
}

async function saveServerConfig(guildId, serverConfig) {
  const {
    rpcUrl,
    tokenAddress,
    minimumBalance,
    startChannelId,
    roleId,
    webhookUrl
  } = serverConfig;
  await db.orm.public.ServerConfig.upsert({
    conflictOn: { guildId },
    update: {
      rpcUrl,
      tokenAddress,
      minimumBalance,
      startChannelId,
      roleId,
      webhookUrl: webhookUrl || ""
    },
    create: {
      guildId,
      rpcUrl,
      tokenAddress,
      minimumBalance,
      startChannelId,
      roleId,
      webhookUrl: webhookUrl || ""
    }
  });
}

async function getServerConfigSettings(serverConfig, isOwner) {
  const {
    rpcUrl,
    tokenAddress,
    minimumBalance,
    startChannelId,
    roleId,
    webhookUrl
  } = serverConfig;

  const provider = new JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();

  const settings = [
    `Chain: ${chain?.name}(${chain?.chainId})`,
    `Token Address: ${tokenAddress}`,
    `Minimum Balance: ${minimumBalance}`,
    `Start Channel: <#${startChannelId}>`,
    `Role: <@&${roleId}>`
  ];

  if (isOwner) {
    settings.push(
      `RPC URL: ||${rpcUrl}||`,
      `Webhook URL: ${webhookUrl ? `||${webhookUrl}||` : "Not Configured"}`
    );
  }
  return settings;
}

async function sendVerifyCommandReply(interaction, serverConfig, jwtToken) {
  const { rpcUrl, tokenAddress, minimumBalance } = serverConfig;
  const provider = new JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();

  const greeting = "Hello there! Welcome to the server!";
  const steps = [
    `Please Click on Verify with Wallet to verify your wallet address.`,
    `Make sure you have at least ${minimumBalance} tokens of the token at address \`${tokenAddress}\` on \`${chain?.name}(${chain?.chainId})\` chain in your wallet.`,
    "Once verified, you'll be automatically assigned the gated role which will give you access to our exclusive channels and perks!"
  ];
  const outro =
    "If you have any questions or encounter any issues, please don't hesitate to reach out to us. Good luck and have fun!";
  const message = greeting + "\n\n" + steps.join("\n") + "\n\n" + outro;

  const verifyWithWalletButton = new ButtonBuilder()
    .setLabel("Verify with Wallet")
    .setStyle(ButtonStyle.Link)
    .setURL(
      `${APP_URL}/verify?token_address=${tokenAddress}&chain_id=${chain?.chainId}&auth_token=${jwtToken}`
    );

  const tokenExplorerButton = new ButtonBuilder()
    .setLabel("View Token on Explorer")
    .setStyle(ButtonStyle.Link)
    .setURL(
      `https://blockscan.com/token/${tokenAddress}?chainId=${chain?.chainId}`
    );
  const actionRow = new ActionRowBuilder().addComponents(
    verifyWithWalletButton,
    tokenExplorerButton
  );

  await interaction.editReply({
    content: message,
    components: [actionRow],
    flags: MessageFlags.Ephemeral
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () =>
  logger.info(`🔥 Server listening at http://localhost:${port} 🚀`)
);
