import { REST, Routes, type Snowflake } from "discord.js";
import { Contract, JsonRpcProvider, parseUnits } from "ethers";
import config from "./config";

// Compatible with ERC-20 and ERC-721 balance checks.
const tokenABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

interface WebhookPayload {
  content: string;
}

// Construct and prepare an instance of the Discord REST module
const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);

// Guild commands to deploy
const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
    async execute(interaction: {
      reply: (message: string) => Promise<unknown>;
    }) {
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
export const deployCommands = (guildId: Snowflake) => {
  console.info(
    `Started deploying ${commands.length} application (/) commands on guild ${guildId}.`
  );
  // The put method is used to fully refresh all commands in the guild with the current set
  rest
    .put(
      Routes.applicationGuildCommands(
        config.DISCORD_BOT_APPLICATION_ID,
        guildId
      ),
      {
        body: commands
      }
    )
    .then((res: unknown) =>
      console.info(
        `Successfully deployed ${Array.isArray(res) ? res.length : 0} application (/) commands.`
      )
    )
    .catch((error: unknown) =>
      console.error(
        `Failed to deploy application (/) commands: ${error instanceof Error ? error.message : String(error)}`
      )
    );
};

// Posts data to the provided webhook URL if provided
export const postDataToWebhook = (
  webhookUrl: string | undefined,
  data: WebhookPayload
) => {
  if (!webhookUrl)
    return console.warn(
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
        console.error(
          `Failed to post data to webhook: ${res.status} - ${res.statusText}`
        );
        return;
      }
      console.info("Data posted to webhook successfully");
    })
    .catch((error: unknown) =>
      console.error("Error while posting data to webhook", error)
    );
};

export const hasRequiredTokenBalance = async ({
  token,
  account,
  rpcUrl,
  minimumBalance
}: {
  token: string;
  account: string;
  rpcUrl: string;
  minimumBalance: number;
}): Promise<boolean> => {
  const provider = new JsonRpcProvider(rpcUrl);
  const tokenContract = new Contract(token, tokenABI, provider) as Contract & {
    decimals: () => Promise<number>;
    balanceOf: (account: string) => Promise<bigint>;
  };
  const chain = await provider.getNetwork();
  console.info(
    `Checking token balance for address: ${account} on ${chain?.name}(${chain?.chainId}) chain`
  );
  try {
    const decimals = await tokenContract.decimals();
    console.log("ERC20 token decimals", decimals);
    const balance = await tokenContract.balanceOf(account);
    const required = parseUnits(minimumBalance.toString(), decimals);
    const hasRequiredBalance = balance >= required;
    console.debug({ type: "ERC20", balance, required, hasRequiredBalance });
    return hasRequiredBalance;
  } catch (err) {
    console.warn("ERC20 check failed, trying ERC721", err);
    const balance = await tokenContract.balanceOf(account).catch((error) => {
      console.error("Failed to get ERC721 balance", error);
      return 0n;
    });
    const required = BigInt(minimumBalance);
    const hasRequiredBalance = balance >= required;
    console.debug({ type: "ERC721", balance, required, hasRequiredBalance });
    return hasRequiredBalance;
  }
};
