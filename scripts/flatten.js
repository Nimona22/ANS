const { execSync } = require("child_process");
const fs = require("fs");

// Run flatten and capture only the solidity output
const raw = execSync("npx hardhat flatten contracts/ANSRegistry.sol", {
  env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" }
}).toString();

// Remove all SPDX lines and any injected env lines
const lines = raw.split("\n").filter(line => {
  if (line.includes("SPDX-License-Identifier")) return false;
  if (line.includes("injected env")) return false;
  if (line.includes("dotenvx")) return false;
  if (line.includes("tip:")) return false;
  return true;
});

const clean = "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n" + lines.join("\n");
fs.writeFileSync("ANSRegistryFlat.sol", clean, "utf8");
console.log("Done. Length:", clean.length);
console.log("First 150 chars:", clean.substring(0, 150));
