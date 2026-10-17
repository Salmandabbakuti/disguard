# DisGuard

DisGuard facilitates secure and gated exclusive access to server channels for users holding specific amount of NFT tokens or ERC20 tokens on any EVM-compatible chain. This bot verifies user's token balances, granting them roles based on their holdings. This role-based access provides exclusive entry to gated channels. This bot can be installed on any Discord server and configured with your own tokens and roles.

### Prerequisites

1. A Discord Account

2. A Discord server where you have permissions to manage roles and channels and add bots.

3. A wallet with required ERC20/721 tokens to be verified.

### Steps:

#### For Server Admins

1. Install the DisGuard bot on your Discord server. You can use the following link to add the bot to your server. [Add Bot to Server](https://discord.com/oauth2/authorize?client_id=1300440657931800598)

![Screen1s-installation](https://github.com/user-attachments/assets/831df9fd-2394-4a11-a8b5-32e4438677db)

> If the bot doesn't have all the permissions listed above in image, it will not work as expected. Make sure to give all the permissions to the bot.

2. Move the bot to the top of the role hierarchy in your server. This is required for the bot to assign roles to users. Settings -> Roles -> Drag the bot role to the top.

![Screen6-role-hierarchy](https://github.com/user-attachments/assets/921c5622-2828-4bfc-a01e-7ea1c80c96a0)

3. Set up the server config(i.e evm chain public rpc url, token address, required balance, role to assign) using the command `/set-serverconfig` in the `#⁠start-here` channel on the server.

#### For Server Members

1. Join the Discord server where the DisGuard bot is installed.

2. Open the `#⁠start-here` (or any info channel your community managers instruct) channel on discord server. Type the command `/verify` in the channel.

3. Bot will send you a link to connect your wallet and sign a message. After you sign the message, the bot will verify if you have required ERC20/721 tokens(token address and required amount set by server admin) in your wallet.

4. If you have required amount of said tokens in wallet, you will be assigned the gated role(set by server admin in config) and gain access to the exclusive channels and perks on the server.

## Getting Started(Developer Guide)

### Prerequisites

1. A Discord account
2. A Discord server where you have permissions to manage roles and channels and add bots.
3. A wallet with required ERC20/721 tokens to be verified.

### Steps:

1. Create a new Discord application and bot on the Discord Developer Portal. [Discord Developer Portal](https://discord.com/developers/applications)

![Screen1-Create_App](https://github.com/user-attachments/assets/e080fd38-ad30-4df8-b43a-e89103dbe468)

2. Go to the Bot tab in application settings and toggle all the necessary permissions for the bot as shown in the image below.

![Screen2-Bot_Settings](https://github.com/user-attachments/assets/241f5d4f-7e3a-45c5-a25e-a6ef6706d3ea)

3. Go to Installation tab and set Installation Contexts to "Guild Install" and then below in Default Installation Settings, choose scopes: "bot" and "applications.commands" and then in permissions, select the permissions you want to give to the bot. Make sure to select Following permissions: "Manage Roles", "View Channels", Send Messages", "Use Slash Commands".

![Screen3-Install_contexts](https://github.com/user-attachments/assets/9a527f2b-001c-410c-8cba-873291b2dc67)

![Screen4-Install_permissions](https://github.com/user-attachments/assets/328908c0-0c62-4193-be7a-046c548cbc6a)

4. Copy th Bot token from Bot tab and Application ID from General Information tab and add them to the .env file. `DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN`, `DISCORD_CLIENT_ID=YOUR_APPLICATION_ID`

5. Update the .env file with the `DATABASE_URL`, `APP_URL`, and other necessary details.

6. Install [Bun](https://bun.com/docs/quickstart), then install dependencies using `bun install`.

7. Run the following commands to set up the database and generate the contract and types:

```bash
# Sync the local schema to database
npx prisma db init

# Generate the contract and types
npx prisma contract emit

# Verify and Sign the contract to the database
npx prisma db sign

# Update database schema and contract only if you make any changes to the contract.prisma file(e.g adding new models or changing existing models)
npx prisma db update
```

8. Validate types with `bun run typecheck`, then start the Bun server and Discord bot using `bun start`. During development, use `bun dev` for watch mode and frontend hot reloading.

9. Copy Install Link from Installation Tab in Application Settings and open it in the browser to add the bot to your server.

![Screen5-Install_link](https://github.com/user-attachments/assets/2aec592c-8a36-40d2-9a13-2eea13490d47)

Follow the steps in the [For Server Admins](#for-server-admins) section to set up the server config and for server members to verify their wallet.

Follow the steps in the [For Server Members](#for-server-members) section to verify your wallet and gain access to the exclusive channels and perks on the server.

### Troubleshooting

If you encounter any issues with the bot, please do the following:

1. Check that the bot has the necessary permissions in the server (Manage Roles, Manage Channels, Manage Messages, Send Messages, Read Message History, Use Slash Commands)
2. Make sure bot role is higher than the roles it is assigning
3. Check that the environment variables have been set up correctly in the .env file
4. Check the logs for any error messages

## Change Log

## v1.8.0

- Moved from Sequelize to Prisma8

## v1.7.2

- Moved client from plain HTML to React with Bun server(Fullstack server) for better maintainability and scalability of the client codebase.

## v1.7.0

- Migrate codebase from Node.js to Bun runtime for improved performance and efficiency.
- Migrated the HTTP API and static client from Express to Bun's native full-stack server (`Bun.serve()`), HTML routes, and built-in JSON `Request`/`Response` APIs.
- Replaced Node/npm runtime commands with Bun install, development, start, and production-build commands.
- Removed Express, its rate-limit middleware, and dotenv; Bun loads `.env` files automatically.

## v1.6.0

- Migrating from Prisma to Sequelize ORM for better maintainability and scalability of the bot codebase.

### v1.5.0

- Migrating from Prisma 7 to Prisma 8
- Fixed discord bot interaction timeout issue by defering reply imeediately and then sending the response after processing the request
- Modularized the bot code and express apis into separate modules for better maintainability and scalability

### v1.4.0

- Added support for any chain ERC20/721 tokens and NFTs by configurable chain RPC URL

### v1.3.0

- Added webhook notifications to alert server admins about verification status changes or critical errors that need attention.
- Added express rate limiter to prevent ddos attacks and spamming of the bot server.
- Updated: show webhookurl with spoiler only to server owner on setting/getting
- Refactored the interaction handlers to make them more maintainable
- Move server source files to src directory

### v1.2.0

- Added winston logger with log level configuration(info, error, warn debug setup in env)for better logging about bot activities(adding bot to server, received commands/messages from which server by whom, user join/left server loggings) and errors.
- Removed unnecessary permissions for the bot while installing, now only required permissions are asked for security reasons.
- Removed unnecessary basic slash commands and added only required commands for the bot.
- Redesigned the verify page for better user experience and added more information about the verification process.
- Better error handling and messages for the user during the verification process.

### v1.1.1

- Added `/get-serverconfig` command to get the server current configured settings
- Renamed `serverconfig` to `/set-serverconfig` command and it will now return config settings(like token address, required balance, channel name, gated role) for confirmation after setting up the server config
- `/verify` command will now also show token explorer link button for the token address set in the server config
- Refactored verify flow, balance checks, and role assignment
- Migrated Client and server to use ethers v6
- Added Developer Guide, Troubelshooting Guide for setting up the bot

### v1.0.0

- Added gating by any ERC20/721 token balances.
- Made the bot generic, allowing installation on multiple Discord servers with customizable options for token address, required balance, and role to assign.

### v0.0.2

- Added gating by utility LinkFolio NFT token balance

### v0.0.1

- Initial release

## Built With

- [Discord](https://discord.com/) - A free communications app that lets you share voice, video, and text chat with friends, game communities, and developers.
- [Discord.js](https://discord.js.org/) - A powerful Node.js module that allows you to interact with the Discord API very easily.
- [Prisma](https://www.prisma.io/) - Next-generation ORM for Node.js & TypeScript | PostgreSQL, MySQL, MariaDB, SQL Server, SQLite, MongoDB and CockroachDB
- [Postgres](https://www.postgresql.org/) - A powerful, open source object-relational database system.
- [Ethers.js](https://docs.ethers.io/v5/) - A library that allows you to interact with the Ethereum blockchain.
- [Bun](https://bun.com/) - JavaScript runtime, package manager, bundler, and native HTTP server used for the full-stack application.

## Safety

This is experimental software and subject to change over time.

This is a proof of concept and is not ready for production use. It is not audited and has not been tested for security. Use at your own risk.
I do not give any warranties and will not be liable for any loss incurred through any use of this codebase.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
