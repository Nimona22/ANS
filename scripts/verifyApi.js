const fs = require("fs");
const https = require("https");

const IMPL = "0xE4ece19957e2242f927Ac66001A6d1e23102253D";
const SOURCE = fs.readFileSync("ReverseFlat.sol", "utf8");

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
