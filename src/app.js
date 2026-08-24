const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");
const {
  Contract,
  formatUnits,
  JsonRpcProvider,
  verifyMessage
} = require("ethers");
const jwt = require("jsonwebtoken");
const db = require("./prisma/db");
const { client, logger, postDataToWebhook } = require("./utils");
const { JWT_SECRET } = require("./config");

// Compatible with ERC-20 and ERC-721 balance checks.
const tokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message:
    "Oops! You’re sending too many requests. Take a breather and try again soon.",
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(rateLimiter);
app.use(express.static(path.join(__dirname, "../public")));

app.post("/verify", async (req, res) => {
  if (
    ["token", "address", "message", "signature"].some((key) => !req.body[key])
  ) {
    return res.status(400).json({
      code: "Bad Request",
      message: "Missing required fields: token/address/message/signature"
    });
  }

  const { token, address, message, signature } = req.body;
  let guildId;
  let serverConfig; // reusing it for error handling in catch block

  try {
    const decodedToken = jwt.verify(token, JWT_SECRET);
    const memberId = decodedToken.memberId;
    guildId = decodedToken.guildId;

    logger.debug("decoded from token", { guildId, memberId });
    logger.info("verifying signature and checking balance");

    const recoveredAddress = verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res
        .status(401)
        .send({ code: "Unauthorized", message: "Invalid wallet signature" });
    }

    serverConfig = await db.ServerConfig.where({
      guildId
    }).first();
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
    try {
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
      logger.warn("failed to get erc20 balance.", err);
      logger.info("trying to get erc721 balance");
      const balance = await tokenContract.balanceOf(address).catch((error) => {
        logger.error("failed to get erc721 balance. returning", error);
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
    if (err instanceof jwt.JsonWebTokenError) {
      return res
        .status(401)
        .json({ code: "Unauthorized", message: err.message });
    }

    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while verifying user: ${err}`
    });

    return res
      .status(500)
      .json({ code: "Internal Server Error", message: err.message });
  }
});

app.get("/verify", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

module.exports = app;
