const { searchParams } = new URL(window.location.href);
const authToken = searchParams.get("auth_token");
const chainId = searchParams.get("chain_id");
const tokenAddress = searchParams.get("token_address");
const hasVerificationLink = Boolean(authToken && chainId && tokenAddress);

const logDiv = document.getElementById("log");
const verifyButton = document.getElementById("verify-btn");
const addressElement = document.getElementById("address");
const verificationView = document.querySelector(".verification-view");
verifyButton.addEventListener("click", handleVerify, false);

if (hasVerificationLink) {
  document.body.classList.add("verification-mode");
  verificationView.hidden = false;
}

function setStatus(message, state = "info") {
  logDiv.textContent = message;
  logDiv.dataset.state = state;
}

async function verify() {
  if (!hasVerificationLink) {
    setStatus(
      "Invalid link! Please use the link provided by the DisGuard bot",
      "error"
    );
    return;
  }

  if (!window.ethereum) {
    setStatus(
      "Install or open a Web3 wallet such as MetaMask to continue.",
      "warning"
    );
    return;
  }

  try {
    const [address] = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    addressElement.textContent = `Connected wallet: ${address}`;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const message = [
      `Welcome to DisGuard. This site is requesting your signature to verify your wallet for checking the balance of the token ${tokenAddress} on chainId ${chainId}`,
      "This request won't trigger transactions or incur gas fees.",
      `Wallet Address: ${address}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Id: ${Math.random().toString(36).slice(-10)}`
    ].join("\n\n");

    const signature = await signer.signMessage(message);

    setStatus("Checking your token balance and assigning your Discord role…");

    const data = { token: authToken, address, message, signature };
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    console.log("Verification response:", response);

    const result = await response.json();

    if (response.ok && result.code === "ok" && result.message === "Success") {
      setStatus(
        "Verification successful! You can now close this tab and return to Discord.",
        "success"
      );
    } else {
      setStatus(
        `Verification failed: ${result.message || "Unknown error"}`,
        "error"
      );
    }
  } catch (err) {
    console.error("Failed to verify wallet:", err);
    const truncatedErrorMessage =
      err.message.length > 95
        ? err.message.substring(0, 95) + "..."
        : err.message;
    setStatus(`Something went wrong: ${truncatedErrorMessage}`, "error");
  }
}

function handleVerify() {
  setStatus("Please wait while we verify your wallet...");
  verifyButton.disabled = true;
  verifyButton.textContent = "Verifying…";
  verify().finally(() => {
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify wallet";
  });
}
