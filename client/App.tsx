import { useState } from "react";
import "./App.css";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<unknown>;
    };
    ethers?: {
      BrowserProvider: new (provider: NonNullable<Window["ethereum"]>) => {
        getSigner: () => Promise<{
          signMessage: (message: string) => Promise<string>;
        }>;
      };
    };
  }
}

const discordInvite =
  "https://discord.com/oauth2/authorize?client_id=1300440657931800598";

export function App() {
  const params = new URL(window.location.href).searchParams;
  const authToken = params.get("auth_token");
  const chainId = params.get("chain_id");
  const tokenAddress = params.get("token_address");
  const [log, setLog] = useState({
    type: "info",
    message: ""
  });
  const [address, setAddress] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const hasVerificationLink = Boolean(authToken && chainId && tokenAddress);

  async function verify() {
    if (!hasVerificationLink) {
      setLog({
        type: "error",
        message:
          "Invalid link! Please use the link provided by the DisGuard bot"
      });
      return;
    }

    if (!window.ethereum) {
      setLog({
        type: "warning",
        message: "Install or open a Web3 wallet such as MetaMask to continue."
      });
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      const [walletAddress] = accounts as string[];
      if (!walletAddress) throw new Error("No wallet account was selected.");

      setAddress(`Connected wallet: ${walletAddress}`);
      if (!window.ethers) {
        setLog({
          type: "error",
          message:
            "Ethers.js library is not loaded. Please check your browser console for errors."
        });
        return;
      }
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const message = [
        `Welcome to DisGuard. This site is requesting your signature to verify your wallet for checking the balance of the token ${tokenAddress} on chainId ${chainId}`,
        "This request won't trigger transactions or incur gas fees.",
        `Wallet Address: ${walletAddress}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Id: ${Math.random().toString(36).slice(-10)}`
      ].join("\n\n");

      const signature = await signer.signMessage(message);
      setLog({
        type: "info",
        message:
          "Checking your token balance and assigning your Discord role..."
      });

      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: authToken,
          address: walletAddress,
          message,
          signature
        })
      });
      console.log("Verification response:", response);

      const result = (await response.json()) as {
        code?: string;
        message?: string;
      };
      if (response.ok && result.code === "ok" && result.message === "Success") {
        setLog({
          type: "success",
          message:
            "Verification successful! You can now close this tab and return to Discord."
        });
      } else {
        setLog({
          type: "error",
          message: `Verification failed: ${result.message || "Unknown error"}`
        });
      }
    } catch (error) {
      console.error("Failed to verify wallet:", error);
      const message = error instanceof Error ? error.message : String(error);
      setLog({
        type: "error",
        message: `Something went wrong: ${message.length > 95 ? `${message.substring(0, 95)}...` : message}`
      });
    }
  }

  async function handleVerify() {
    setIsVerifying(true);
    setLog({
      type: "info",
      message: "Please wait while we verify your wallet..."
    });
    try {
      await verify();
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="App">
      <header className="container nav">
        <a className="brand" href="/">
          DisGuard
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a
            href="https://github.com/Salmandabbakuti/disguard?tab=readme-ov-file#disguard"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            className="button"
            href={discordInvite}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Discord
          </a>
        </nav>
      </header>

      <main className="container">
        {hasVerificationLink ? (
          <section className="verification-view" aria-labelledby="verify-title">
            <article className="verify-card">
              <p className="eyebrow">Discord verification</p>
              <h3 id="verify-title">Verify your wallet.</h3>
              <p>
                Connect the wallet that holds the required token, then sign a
                message to prove you own it. This does not create a transaction
                or cost gas.
              </p>
              <button
                className="button"
                type="button"
                onClick={handleVerify}
                disabled={isVerifying}
              >
                {isVerifying ? "Verifying..." : "Verify wallet"}
              </button>
              <p className="address" aria-live="polite">
                {address}
              </p>
              <p className="log" data-state={log.type} role="status">
                {log.message ||
                  "We will check your balance against this server's requirement and assign its Discord role if you qualify."}
              </p>
            </article>
          </section>
        ) : (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <header>
                <p className="eyebrow">Token-gated Discord access</p>
                <h1 id="hero-title">Token-gated roles for Discord.</h1>
                <p className="lead">
                  DisGuard checks ERC-20 or ERC-721 holdings on your chosen
                  EVM-compatible chain and assigns a Discord role when a member
                  meets your balance requirement.
                </p>
                <p className="actions">
                  <a
                    className="button"
                    href={discordInvite}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Add DisGuard to Discord
                  </a>
                  <a className="button secondary" href="#how-it-works">
                    See the setup
                  </a>
                </p>
                <ul className="capabilities">
                  <li>ERC-20 and ERC-721</li>
                  <li>Any EVM-compatible chain</li>
                  <li>Signature only, no gas</li>
                </ul>
              </header>
            </section>

            <section
              className="section"
              id="how-it-works"
              aria-labelledby="steps-title"
            >
              <header className="section-header">
                <p className="eyebrow">How it works</p>
                <h2 id="steps-title">Three steps from setup to access.</h2>
                <p>
                  Configure the rule in Discord. Members prove wallet ownership.
                  DisGuard checks the balance and assigns the role.
                </p>
              </header>
              <ol className="steps">
                <li>
                  <span className="step-number">01</span>
                  <strong>Admin: configure the rule</strong>
                  <span>
                    Install DisGuard on your Discord server, move its bot role
                    above the gated role in Server Settings → Roles, then run{" "}
                    <code>/set-serverconfig</code> to configure the RPC URL,
                    token address, minimum balance, start channel, and role.
                  </span>
                </li>
                <li>
                  <span className="step-number">02</span>
                  <strong>Member: prove ownership</strong>
                  <span>
                    Run <code>/verify</code> in the configured start channel.
                    Open the link, connect a wallet, and sign a message. No
                    transaction is sent and no gas is charged.
                  </span>
                </li>
                <li>
                  <span className="step-number">03</span>
                  <strong>DisGuard: check and assign</strong>
                  <span>
                    DisGuard verifies the signature, checks the wallet's ERC-20
                    or ERC-721 balance through the configured RPC, and assigns
                    the Discord role when the minimum is met. That role unlocks
                    the gated channels.
                  </span>
                </li>
              </ol>
            </section>

            <section className="closing" aria-labelledby="closing-title">
              <p className="eyebrow">Built for your community</p>
              <h2 id="closing-title">
                Give your holders the access they earned.
              </h2>
              <a
                className="button"
                href={discordInvite}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Discord
              </a>
            </section>
          </>
        )}
      </main>

      <footer className="container">
        ©{new Date().getFullYear()} DisGuard · Token gated access for Discord
        servers.
      </footer>
    </div>
  );
}

export default App;
