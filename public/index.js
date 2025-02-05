import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";

const { searchParams } = new URL(window.location.href);
const authToken = searchParams.get("auth_token");
const chainId = searchParams.get("chain_id");
const tokenAddress = searchParams.get("token_address");

const logDiv = document.getElementById("log");
const verifyButton = document.getElementById("verify-btn");
verifyButton.addEventListener("click", handleVerify, false);

async function verify() {
  // if any of the required parameters are missing, show an error message
  if (!authToken || !chainId || !tokenAddress) {
    logDiv.style.color = "red";
    logDiv.innerHTML =
      "⮾ Invalid link! Please use the link provided by the DisGuard bot";
    return;
  }

  if (!window.ethereum) {
    logDiv.style.color = "#ffc107";
    logDiv.innerHTML =
      "⚠ Please use a Web3 browser like MetaMask to connect your wallet";
    return;
  }

  try {
    const [address] = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    document.getElementById(
      "address"
    ).innerHTML = `Your wallet address: <strong>${address}</strong>`;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // update sign message with tokenaddress and chainid

    const message = [
      `Welcome to DisGuard. This site is requesting your signature to verify your wallet for checking the balance of the token ${tokenAddress} on chainId ${chainId}`,
      "This request won't trigger transactions or incur gas fees.",
      `Wallet Address: ${address}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Id: ${Math.random().toString(36).slice(-10)}`
    ].join("\n\n");

    const signature = await signer.signMessage(message);

    logDiv.innerHTML =
      "ⓘ Please wait while we authorize your request... We've sent out our highly trained monkeys to get the job done. They're currently working on it, so just sit back and relax for a moment! 🐒🍌";

    const data = { token: authToken, address, message, signature };
    const response = await fetch("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok && result.code === "ok" && result.message === "Success") {
      logDiv.style.color = "green";
      logDiv.innerHTML =
        "✔ Verification successful! You can now close this tab and return to Discord.";
    } else {
      logDiv.style.color = "red";
      logDiv.innerHTML = `⮾ Verification failed! ${
        result.message || "Unknown error"
      }`;
    }
  } catch (err) {
    console.error("Failed to verify wallet:", err);
    const truncatedErrorMessage =
      err.message.length > 95
        ? err.message.substring(0, 95) + "..."
        : err.message;
    logDiv.style.color = "red";
    logDiv.innerHTML = `⮾ Something went wrong! ${truncatedErrorMessage}`;
  }
}

function handleVerify() {
  logDiv.style.color = "#333";
  logDiv.innerHTML = "ⓘ Please wait while we verify your wallet...";
  verifyButton.disabled = true;
  verifyButton.innerHTML = "🛡️ Verifying...";
  verify().finally(() => {
    verifyButton.disabled = false;
    verifyButton.innerHTML = "🛡️ Verify Wallet";
  });
}
