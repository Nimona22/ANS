const https = require("https");
const { execSync } = require("child_process");

const IMPL = "0x699B1cDC6b5331D8293071C1f481f585819cA9a0";

const raw = execSync("npx hardhat flatten contracts/core/ANSReverseRegistry.sol").toString();
const lines = raw.split("\n").filter(line => {
  if (line.includes("SPDX-License-Identifier")) return false;
  if (line.includes("injected env")) return false;
  if (line.includes("dotenvx")) return false;
  if (line.includes("tip:")) return false;
  if (line.trim().startsWith("//")) return false;
  if (line.trim().startsWith("*")) return false;
  if (line.trim().startsWith("/**")) return false;
  return true;
});
const SOURCE = "// SPDX-License-Identifier: MIT\n" + lines.join("\n");

const payload = JSON.stringify({
  module: "contract",
  action: "verifysourcecode",
  contractaddress: IMPL,
  sourceCode: SOURCE,
  codeformat: "solidity-single-file",
  contractname: "ANSReverseRegistry",
  compilerversion: "v0.8.20+commit.a1b79de6",
  optimizationUsed: "1",
  runs: "200",
  evmversion: "paris",
  licenseType: "1"
});

const options = {
  hostname: "testnet.arcscan.app",
  path: "/api",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => console.log("Response:", data));
});

req.on("error", e => console.error("Error:", e));
req.write(payload);
req.end();
