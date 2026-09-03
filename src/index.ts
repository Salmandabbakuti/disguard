import { serve } from "bun";
import { verifyMessage, JsonRpcProvider } from "ethers";
import jwt from "jsonwebtoken";
import ServerConfig from "./database/models/ServerConfig";
import { postDataToWebhook, hasRequiredTokenBalance } from "./utils";
import config from "./config";
import type { SendableChannels } from "discord.js";
import { client } from "./discord";
import index from "../public/index.html";

type VerifyRequestBody = {
  token: string;
  address: string;
  message: string;
  signature: string;
};

const handleVerify = async (req: Request) => {
  console.log("Received verification request");
  const body = (await req.json()) as Record<string, unknown>;
  if (["token", "address", "message", "signature"].some((key) => !body[key]))
    return Response.json(
      {
        code: "Bad Request",
        message: "Missing required fields: token/address/message/signature"
      },
      { status: 400 }
    );
  const { token, address, message, signature } = body as VerifyRequestBody;
  let guildId: string;
  let serverConfig: ServerConfig | null = null; // reusing it for error handling in catch block

  try {
    const decodedToken = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    const memberId = decodedToken.memberId as string;
    guildId = decodedToken.guildId as string;

    console.debug("decoded from token", { guildId, memberId });
    console.info("verifying signature and checking balance");

    const recoveredAddress = verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return Response.json(
        { code: "Unauthorized", message: "Invalid wallet signature" },
        { status: 401 }
      );
    }

    serverConfig = await ServerConfig.findOne({
      where: {
        guildId
      }
    });
    if (!serverConfig) {
      return Response.json(
        {
          code: "Service Unavailable",
          message: "Discord server not yet configured for verification"
        },
        { status: 503 }
      );
    }

    const { rpcUrl, tokenAddress, minimumBalance, startChannelId, roleId } =
      serverConfig;

    const hasRequiredBalance = await hasRequiredTokenBalance({
      token: tokenAddress,
      account: address,
      rpcUrl,
      minimumBalance
    });

    const guild = client.guilds.cache.get(guildId)!;
    const member = await guild.members.fetch(memberId);
    const startHereChannel = guild.channels.cache.get(
      startChannelId
    )! as SendableChannels;
    const truncatedAddress = address.slice(0, 5) + "..." + address.slice(-4);

    if (hasRequiredBalance) {
      const gatedRole = guild.roles.cache.find((role) => role.id === roleId)!;
      await member.roles.add(gatedRole);
      console.info(
        `${member.user.tag} verified and given ${gatedRole.name} role on server: ${guild.name}`
      );
      startHereChannel.send(
        `Hey <@${memberId}>, your wallet address ${truncatedAddress} has been verified and you have been given ${gatedRole.name} role. You can now access the gated channels.`
      );
    } else {
      console.info(
        `${member.user.tag} verified but does not satisfy rules set on server: ${guild.name}`
      );
      const provider = new JsonRpcProvider(rpcUrl);
      const chain = await provider.getNetwork().catch((error) => {
        console.error("Failed to get network info from RPC URL:", error);
        return null;
      });
      startHereChannel.send(
        `Hey <@${memberId}>, your wallet address ${truncatedAddress} has been verified. but, you do not have the required balance of tokens in your wallet. Please make sure you have at least ${minimumBalance} tokens of the token at address \`${tokenAddress}\` on \`${chain?.name}(${chain?.chainId})\` chain in your wallet.`
      );
    }

    return Response.json({ code: "ok", message: "Success" });
  } catch (error: unknown) {
    console.error("failed to verify user:", error);
    if (error instanceof jwt.JsonWebTokenError) {
      return Response.json(
        { code: "Unauthorized", message: error.message },
        { status: 401 }
      );
    }

    console.log("Posting data to webhook:", serverConfig?.webhookUrl);
    postDataToWebhook(serverConfig?.webhookUrl, {
      content: `DisGuard - Attention Required: Internal Server Error while verifying user: ${error}`
    });

    return Response.json(
      {
        code: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
};

const server = serve({
  development: true,
  port: 3000,
  routes: {
    "/": index,
    "/verify": index,
    "/api/verify": {
      POST: handleVerify
    }
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  }
});

console.log(`🔥 Server listening at ${server.url} 🚀`);
