const { exec } = require("child_process");
const util = require("util");
require("dotenv").config();

// Promisify exec for async/await
const execPromise = util.promisify(exec);

// Chain choice: 0 -> PLS, 1 -> BNB, 2 -> BOTH
const CHAIN_CHOICE = parseInt(process.env.CHAIN_CHOICE);

// Validate CHAIN_CHOICE
if (![0, 1, 2].includes(CHAIN_CHOICE)) {
  console.error("Error: CHAIN_CHOICE must be 0 (PLS), 1 (BNB), or 2 (BOTH).");
  process.exit(1);
}

// Read keystore names and passwords based on CHAIN_CHOICE
const plsKeystoreNames = CHAIN_CHOICE === 0 || CHAIN_CHOICE === 2 ? (process.env.PLS_KEYSTORE_NAME ? process.env.PLS_KEYSTORE_NAME.split(",").map((name) => name.trim()) : []) : [];
const bnbKeystoreNames = CHAIN_CHOICE === 1 || CHAIN_CHOICE === 2 ? (process.env.BNB_KEYSTORE_NAME ? process.env.BNB_KEYSTORE_NAME.split(",").map((name) => name.trim()) : []) : [];
const plsKeystorePasswords = CHAIN_CHOICE === 0 || CHAIN_CHOICE === 2 ? (process.env.PLS_KEYSTORE_PASSWORD ? process.env.PLS_KEYSTORE_PASSWORD.split(",").map((pw) => pw.trim()) : []) : [];
const bnbKeystorePasswords = CHAIN_CHOICE === 1 || CHAIN_CHOICE === 2 ? (process.env.BNB_KEYSTORE_PASSWORD ? process.env.BNB_KEYSTORE_PASSWORD.split(",").map((pw) => pw.trim()) : []) : [];

// Validate input based on CHAIN_CHOICE
if (CHAIN_CHOICE === 0 || CHAIN_CHOICE === 2) {
  if (plsKeystoreNames.length === 0) {
    console.error("Error: At least one PLS keystore name must be provided when CHAIN_CHOICE is 0 or 2.");
    process.exit(1);
  }
  if (plsKeystoreNames.length !== plsKeystorePasswords.length) {
    console.error("Error: Number of PLS keystore names must match number of PLS passwords.");
    process.exit(1);
  }
}

if (CHAIN_CHOICE === 1 || CHAIN_CHOICE === 2) {
  if (bnbKeystoreNames.length === 0) {
    console.error("Error: At least one BNB keystore name must be provided when CHAIN_CHOICE is 1 or 2.");
    process.exit(1);
  }
  if (bnbKeystoreNames.length !== bnbKeystorePasswords.length) {
    console.error("Error: Number of BNB keystore names must match number of BNB passwords.");
    process.exit(1);
  }
}

// Chain configurations
const chains = {
  BNB: {
    rpcUrl: process.env.BNB_RPC_URL || "https://bsc-dataseed.bnbchain.org",
    script: "script/BNBCrime.s.sol:BNBCrime",
    keystoreNames: bnbKeystoreNames,
    keystorePasswords: bnbKeystorePasswords,
    crimeType: parseInt(process.env.BNB_CRIME_TYPE)
  },
  PLS: {
    rpcUrl: process.env.PLS_RPC_URL || "https://rpc-pulsechain.g4mm4.io",
    script: "script/PLSCrime.s.sol:PLSCrime",
    keystoreNames: plsKeystoreNames,
    keystorePasswords: plsKeystorePasswords,
    crimeType: parseInt(process.env.PLS_CRIME_TYPE)
  },
};

// Function to run makeCrime for a single wallet
async function runMakeCrime(chainName, keystoreName, keystorePassword, crimeType) {
  try {
    const chain = chains[chainName];
    const command = `forge script ${chain.script} --rpc-url ${chain.rpcUrl} --broadcast --account ${keystoreName} --password ${keystorePassword} --sig "run(uint8)" ${crimeType}`;

    const { stdout, stderr } = await execPromise(command, { cwd: "./foundry-crime-scripts" });
    console.log(`${chainName} makeCrime (crimeType: ${crimeType}) executed successfully for ${keystoreName}`);

    return { success: true, output: stdout };
  } catch (error) {
    console.error(`${chainName} makeCrime failed for ${keystoreName}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Function to schedule makeCrime for a single wallet
function scheduleWallet(chainName, keystoreName, keystorePassword, crimeType) {
  async function runAndReschedule() {
    const result = await runMakeCrime(chainName, keystoreName, keystorePassword, crimeType);
    const delay = 16 * 60 * 1000; // 16 minutes in milliseconds (1 min buffer to account for block times + other txn delays)

    console.log(
      `${chainName} next run for ${keystoreName} scheduled for ${new Date(Date.now() + delay).toISOString()} (in ${delay / 1000 / 60} minutes)`
    );
    setTimeout(runAndReschedule, delay);
  }

  runAndReschedule();
}

// Function to start scheduling for all wallets on a chain
function startChainScheduling(chainName) {
  const chain = chains[chainName];

  for (let i = 0; i < chain.keystoreNames.length; i++) {
    scheduleWallet(chainName, chain.keystoreNames[i], chain.keystorePasswords[i], chain.crimeType);
  }
}

// Main function to start scheduling based on CHAIN_CHOICE
function startScheduler() {
  console.log(`Starting scheduler at ${new Date().toISOString()}`);

  if (CHAIN_CHOICE === 0 || CHAIN_CHOICE === 2) {
    startChainScheduling("PLS");
  }
  if (CHAIN_CHOICE === 1 || CHAIN_CHOICE === 2) {
    startChainScheduling("BNB");
  }

  console.log("Scheduler started with fixed 16-minute intervals.");
}

// Start the scheduler
startScheduler();
