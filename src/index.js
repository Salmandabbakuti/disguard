const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require("discord.js");
const {
  Contract,
  formatUnits,
  isAddress,
  JsonRpcProvider,
  verifyMessage
} = require("ethers");
const jwt = require("jsonwebtoken");
const path = require("path");
const prisma = require("./prisma");
const { deployCommands, logger, postDataToWebhook } = require("./utils");

const { DISCORD_BOT_TOKEN, APP_URL, JWT_SECRET } = require("./config");

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minutes
  limit: 10, // max of 10 requests per minute
  message:
    "Oops! You’re sending too many requests. Take a breather and try again soon.",
  standardHeaders: "draft-7", // if set to true, will treat as draft-6(separate props)
  legacyHeaders: false
});

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(rateLimiter);
app.use(express.static(path.join(__dirname, "../public")));

// compatile with erc20/erc721
const tokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

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
  prisma.serverConfig
    .delete({
      where: { guildId: guild.id }
    })
    .catch((err) => {
      logger.error("Failed to delete server config", err);
    });
});

client.on(Events.GuildMemberAdd, async (member) => {
  logger.info(`${member.user.tag} joined the server: ${member.guild.name}`);
  //get starthere channel from server config table
  const serverConfig = await prisma.serverConfig.findUnique({
    where: { guildId: member.guild.id }
  });

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

  const serverConfig = await prisma.serverConfig.findUnique({
    where: { guildId: msg.guildId }
  });

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
      interaction.reply({ content: "Unknown command", ephemeral: true });
      break;
  }
});

async function handlePingCommand(interaction) {
  await interaction.reply({
    content: "pong!",
    ephemeral: true
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

  if (!isServerOwner(interaction)) {
    return sendEphemeralReply(
      interaction,
      "You are not authorized to configure the server."
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
    await sendServerConfigSuccessReply(interaction, serverConfig);
  } catch (err) {
    logger.error("Failed to save server config", err);
    sendEphemeralReply(
      interaction,
      "Failed to save server config. Please try again later."
    );
    prisma.serverConfig
      .findUnique({
        where: { guildId: interaction.guildId }
      })
      .then((serverConfig) => {
        postDataToWebhook(serverConfig?.webhookUrl, {
          content: `DisGuard - Attention Required: Internal Server Error while setting server config: ${err}`
        });
      })
      .catch((err) => {
        logger.error("Failed to get server config", err);
      });
  }
}

async function handleGetServerConfig(interaction) {
  try {
    const serverConfig = await prisma.serverConfig.findUnique({
      where: { guildId: interaction.guildId }
    });

    if (!serverConfig) {
      return sendEphemeralReply(
        interaction,
        "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
      );
    }

    await sendServerConfigReply(interaction, serverConfig);
  } catch (err) {
    logger.error("Failed to get server config", err);
    sendEphemeralReply(
      interaction,
      "Failed to get server config. Please try again later."
    );
    // send error message to webhook if available
    prisma.serverConfig
      .findUnique({
        where: { guildId: interaction.guildId }
      })
      .then((serverConfig) => {
        postDataToWebhook(serverConfig?.webhookUrl, {
          content: `DisGuard - Attention Required: Internal Server Error while getting server config: ${err}`
        });
      })
      .catch((err) => {
        logger.error("Failed to get server config", err);
      });
  }
}

async function handleVerifyCommand(interaction) {
  try {
    const serverConfig = await prisma.serverConfig.findUnique({
      where: { guildId: interaction.guildId }
    });

    if (!serverConfig) {
      return sendEphemeralReply(
        interaction,
        "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
      );
    }

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
    prisma.serverConfig
      .findUnique({
        where: { guildId: interaction.guildId }
      })
      .then((serverConfig) => {
        postDataToWebhook(serverConfig?.webhookUrl, {
          content: `DisGuard - Attention Required: Internal Server Error while handling verify command: ${err}`
        });
      })
      .catch((err) => {
        logger.error(
          "Failed to get server config on verification request",
          err
        );
      });
  }
}

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
  return interaction.reply({
    content: message,
    ephemeral: true
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
  await prisma.serverConfig.upsert({
    where: { guildId },
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

async function sendServerConfigSuccessReply(interaction, serverConfig) {
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

  const infoMessage = "Server configured successfully. Here are the settings:";
  const settings = [
    `Chain: ${chain?.name}(${chain?.chainId})`,
    `Token Address: ${tokenAddress}`,
    `Minimum Balance: ${minimumBalance}`,
    `Start Channel: <#${startChannelId}>`,
    `Role: <@&${roleId}>`
  ];

  if (isServerOwner(interaction) && webhookUrl) {
    settings.push(`RPC URL: ||${rpcUrl}||`, `Webhook URL: ||${webhookUrl}||`);
  }

  const outro =
    "Server members can now use `/verify` command to verify their wallet and get gated role which gives access to exclusive channels and perks!";
  const message = infoMessage + "\n\n" + settings.join("\n") + "\n\n" + outro;

  await interaction.reply({
    content: message,
    ephemeral: true
  });
}

async function sendServerConfigReply(interaction, serverConfig) {
  const {
    rpcUrl,
    tokenAddress,
    minimumBalance,
    startChannelId,
    roleId,
    webhookUrl
  } = serverConfig;
  const isServerOwnerFlag = isServerOwner(interaction);
  const provider = new JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();

  const settings = [
    `Chain: ${chain?.name}(${chain?.chainId})`,
    `Token Address: ${tokenAddress}`,
    `Minimum Balance: ${minimumBalance}`,
    `Start Channel: <#${startChannelId}>`,
    `Role: <@&${roleId}>`
  ];

  if (isServerOwnerFlag && webhookUrl) {
    settings.push(`RPC URL: ||${rpcUrl}||`, `Webhook URL: ||${webhookUrl}||`);
  }

  const message =
    "Here are the server's current configuration settings:\n\n" +
    settings.join("\n");
  await interaction.reply({
    content: message,
    ephemeral: true
  });
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
    .setURL(`${APP_URL}/verify?token=${jwtToken}`);

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

  await interaction.reply({
    content: message,
    components: [actionRow],
    ephemeral: true
  });
}

app.post("/verify", async (req, res) => {
  if (
    ["token", "address", "message", "signature"].some((key) => !req.body[key])
  )
    return res.status(400).json({
      code: "Bad Request",
      message: "Missing required fields: token/address/message/signature"
    });
  const { token, address, message, signature } = req.body;
  let guildId, memberId;
  try {
    ({ guildId, memberId } = jwt.verify(token, JWT_SECRET));
    logger.debug("decoded from token", { guildId, memberId });
    logger.info("verifying signature and checking balance");
    const recoveredAddress = verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase())
      return res
        .status(401)
        .send({ code: "Unauthorized", message: "Invalid wallet signature" });

    // get serverconfig
    const serverConfig = await prisma.serverConfig.findUnique({
      where: { guildId }
    });

    if (!serverConfig) {
      return res.status(503).json({
        code: "Service Unavailable",
        message: "Discord server not yet configured for verification"
      });
    }
    const { rpcUrl, tokenAddress, minimumBalance, startChannelId, roleId } =
      serverConfig;

    const provider = new JsonRpcProvider(rpcUrl);
    const tokenContract = new Contract(tokenAddress, tokenABI, provider);
    const chain = await provider.getNetwork();

    logger.info(
      `Checking token balance for address: ${address} on ${chain?.name}(${chain?.chainId}) chain`
    );

    let hasRequiredBalance = false;
    // try checking erc20/721 by calling decimals
    try {
      // erc20
      logger.info("trying to get erc20 balance");
      const decimals = await tokenContract.decimals();
      logger.debug("erc20 token decimals", decimals);
      const balanceWei = await tokenContract.balanceOf(address);
      const balance = parseFloat(formatUnits(balanceWei, decimals));
      logger.debug(
        `ERC20 token balance: ${balance}, required: ${minimumBalance}`
      );
      hasRequiredBalance = balance >= parseFloat(minimumBalance);
    } catch (err) {
      // erc721
      logger.warn("failed to get erc20 balance.", err);
      logger.info("trying to get erc721 balance");
      const balance = await tokenContract.balanceOf(address).catch((err) => {
        logger.error("failed to get erc721 balance. returning", err);
        return 0n;
      });
      logger.debug(
        `ERC721 token balance: ${balance}, required: ${minimumBalance}`
      );
      hasRequiredBalance = balance >= BigInt(minimumBalance);
    }
    logger.debug("User has required balance?:", hasRequiredBalance);

    const guild = client.guilds.cache.get(guildId);
    const member = await guild.members.fetch(memberId);
    const startHereChannel = guild.channels.cache.get(startChannelId);
    const truncatedAddress = address.slice(0, 5) + "..." + address.slice(-4);

    if (hasRequiredBalance) {
      const gatedRole = guild.roles.cache.find((role) => role.id === roleId);
      await member.roles.add(gatedRole);
      logger.info(
        `${member.user.tag} verified and given ${gatedRole.name} role on server: ${guild.name}`
      );
      startHereChannel.send(
        `Hey <@${memberId}>, your wallet address ${truncatedAddress} has been verified and you have been given ${gatedRole.name} role. You can now access the gated channels.`
      );
    } else {
      logger.info(
        `${member.user.tag} verified but does not satisfy rules set on server: ${guild.name}`
      );
      startHereChannel.send(
        `Hey <@${memberId}>, your wallet address ${truncatedAddress} has been verified. but, you do not have the required balance of tokens in your wallet. Please make sure you have at least ${minimumBalance} tokens of the token at address \`${tokenAddress}\` on \`${chain?.name}(${chain?.chainId})\` chain in your wallet.`
      );
    }
    return res.status(200).json({ code: "ok", message: "Success" });
  } catch (err) {
    logger.error("failed to verify user:", err);
    if (err instanceof jwt.JsonWebTokenError)
      return res
        .status(401)
        .json({ code: "Unauthorized", message: err.message });
    // send error message to webhook if available
    prisma.serverConfig
      .findUnique({
        where: { guildId }
      })
      .then((serverConfig) => {
        postDataToWebhook(serverConfig?.webhookUrl, {
          content: `DisGuard - Attention Required: Internal Server Error while verifying user: ${err}`
        });
      })
      .catch((err) => {
        logger.error("Failed to get server config on verifying user", err);
      });
    return res
      .status(500)
      .json({ code: "Internal Server Error", message: err.message });
  }
});

app.get("/verify", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

const port = process.env.PORT || 3000;
app.listen(port, () =>
  logger.info(`🔥 Server listening at http://localhost:${port} 🚀`)
);
