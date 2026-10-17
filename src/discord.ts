import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  type SendableChannels
} from "discord.js";
import { isAddress, JsonRpcProvider } from "ethers";
import jwt from "jsonwebtoken";
import db from "./prisma/db";
import { deployCommands, postDataToWebhook } from "./utils";
import config from "./config";

interface ServerConfigInput {
  rpcUrl: string;
  tokenAddress: string;
  webhookUrl: string | null;
  minimumBalance: number;
  startChannelId: string;
  roleId: string;
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel]
});

void client.login(config.DISCORD_BOT_TOKEN);

// Event listeners for the Discord bot
client.once(Events.ClientReady, () =>
  console.info(`Logged in as ${client.user!.tag}`)
);

client.on(Events.GuildCreate, (guild) => {
  console.info("Bot added to guild:", guild.name);
  //deploy slash commands on the joined guild
  deployCommands(guild.id);
});

client.on(Events.GuildDelete, (guild) => {
  console.info("Bot removed from guild:", guild.name);
  //delete the guild from the db
  void db.ServerConfig.where({ guildId: guild.id })
    .delete()
    .catch((error: unknown) => {
      console.error("Failed to delete server config", error);
    });
});

client.on(Events.GuildMemberAdd, async (member) => {
  console.info(`${member.user.tag} joined the server: ${member.guild.name}`);
  //get starthere channel from server config table
  const serverConfig = await db.ServerConfig.first({
    guildId: member.guild.id
  });

  if (!serverConfig) {
    console.warn(
      `Server not configured for ${member.guild.name}. Skipping welcome message for new joiner.`
    );
    return;
  }
  const startHereChannel = member.guild.channels.cache.get(
    serverConfig.startChannelId
  );
  if (!startHereChannel) {
    console.warn(
      `Configured start channel not found for ${member.guild.name}. Skipping welcome message for new joiner.`
    );
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Configured start channel not found for ${member.guild.name} welcome messages!`
    });
    return;
  }

  (startHereChannel as SendableChannels).send({
    content: `Welcome, <@${member.id}>. We hope you brought pizza! Please type \`/verify\` command to verify your wallet and get access to our exclusive channels and perks!`
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  console.info(`${member.user.tag} left the server: ${member.guild.name}`);
});

client.on(Events.MessageCreate, async (msg) => {
  const guild = msg.guild;
  if (
    msg.author.bot ||
    msg.system ||
    msg.channel.type === ChannelType.DM ||
    !guild
  )
    return;
  console.info(
    `Message received in ${guild.name} from ${msg.author.tag}: ${msg.content}`
  );

  const serverConfig = await db.ServerConfig.first({
    guildId: guild.id
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
  if (!interaction.isChatInputCommand()) return;

  console.info(
    `Interaction /${interaction.commandName} received in ${interaction.guild!.name} from ${interaction.user.tag}`
  );

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
      void interaction.reply({
        content: "Unknown command",
        flags: MessageFlags.Ephemeral
      });
      break;
  }
});

async function handlePingCommand(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: "pong!",
    flags: MessageFlags.Ephemeral
  });
}

async function handleSetServerConfig(interaction: ChatInputCommandInteraction) {
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
    return interaction.editReply({
      content: "You are not authorized to configure the server."
    });
  }

  if (!isAddress(tokenAddress)) {
    return interaction.editReply({
      content: "Invalid token address. Please provide a valid Ethereum address."
    });
  }

  if (
    webhookUrl &&
    !webhookUrl.startsWith("https://discord.com/api/webhooks/")
  ) {
    return interaction.editReply({
      content:
        "Invalid discord webhook URL. It should start with `https://discord.com/api/webhooks/`"
    });
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
    await saveServerConfig(interaction.guildId!, serverConfig);
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
      content: message
    });
  } catch (error: unknown) {
    console.error("Failed to save server config", error);
    await interaction.editReply({
      content: "Failed to save server config. Please try again later."
    });
    postDataToWebhook(serverConfig.webhookUrl ?? undefined, {
      content: `DisGuard - Attention Required: Internal Server Error while setting server config: ${error}`
    });
  }
}

async function handleGetServerConfig(interaction: ChatInputCommandInteraction) {
  // acknowledge the command and defer the reply to give time for processing
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const serverConfig = await db.ServerConfig.first({
    guildId: interaction.guildId!
  });

  if (!serverConfig) {
    return interaction.editReply({
      content:
        "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
    });
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
      content: message
    });
  } catch (error: unknown) {
    console.error("Failed to get server config", error);
    await interaction.editReply({
      content: "Failed to get server config. Please try again later."
    });
    // send error message to webhook if available
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while getting server config: ${error}`
    });
  }
}

async function handleVerifyCommand(interaction: ChatInputCommandInteraction) {
  // acknowledge the command and defer the reply to give time for processing
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const serverConfig = await db.ServerConfig.first({
    guildId: interaction.guildId!
  });

  if (!serverConfig) {
    return interaction.editReply({
      content:
        "Server not configured. Ask server admin to configure the server with `/set-serverconfig` command"
    });
  }

  // check if member has role already, if yes, return message
  const { guildId, roleId } = serverConfig;
  const guild = client.guilds.cache.get(guildId)!;
  const member = await guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(roleId);
  if (hasRole) {
    return interaction.editReply({
      content:
        "You are already verified and have the gated role. You can access the gated channels."
    });
  }

  try {
    const jwtToken = jwt.sign(
      {
        configId: serverConfig.id,
        guildId: interaction.guildId,
        memberId: (interaction.member as GuildMember).id
      },
      config.JWT_SECRET!,
      { expiresIn: "5m" } // 5 minutes
    );
    await sendVerifyCommandReply(interaction, serverConfig, jwtToken);
  } catch (error: unknown) {
    console.error("Failed to handle verify command", error);
    await interaction.editReply({
      content: "Failed to send verification request. Please try again later."
    });
    // send error message to webhook if available
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while handling verify command: ${error}`
    });
  }
}

// handler utils
function getConfigOptions(
  interaction: ChatInputCommandInteraction
): ServerConfigInput {
  return {
    rpcUrl: interaction.options.getString("rpcurl")!,
    tokenAddress: interaction.options.getString("tokenaddress")!,
    webhookUrl: interaction.options.getString("webhookurl"),
    minimumBalance: interaction.options.getInteger("minimumbalance")!,
    startChannelId: interaction.options.getChannel("startchannel")!.id,
    roleId: interaction.options.getRole("role")!.id
  };
}

function isServerOwner(interaction: ChatInputCommandInteraction): boolean {
  return (
    (interaction.member as GuildMember).user.id === interaction.guild!.ownerId
  );
}

async function saveServerConfig(
  guildId: string,
  serverConfig: ServerConfigInput
): Promise<void> {
  const {
    rpcUrl,
    tokenAddress,
    minimumBalance,
    startChannelId,
    roleId,
    webhookUrl
  } = serverConfig;

  await db.ServerConfig.upsert({
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

async function getServerConfigSettings(
  serverConfig: ServerConfigInput,
  isOwner: boolean
): Promise<string[]> {
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

async function sendVerifyCommandReply(
  interaction: ChatInputCommandInteraction,
  serverConfig: ServerConfigInput,
  jwtToken: string
): Promise<void> {
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
      `${config.APP_URL}/verify?token_address=${tokenAddress}&chain_id=${chain?.chainId}&auth_token=${jwtToken}`
    );

  const tokenExplorerButton = new ButtonBuilder()
    .setLabel("View Token on Explorer")
    .setStyle(ButtonStyle.Link)
    .setURL(
      `https://blockscan.com/token/${tokenAddress}?chainId=${chain?.chainId}`
    );
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    verifyWithWalletButton,
    tokenExplorerButton
  );

  await interaction.editReply({
    content: message,
    components: [actionRow]
  });
}
