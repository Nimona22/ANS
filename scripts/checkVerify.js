const https = require("https");

const IMPL = "0xE4ece19957e2242f927Ac66001A6d1e23102253D";

const options = {
  hostname: "testnet.arcscan.app",
  path: `/api?module=contract&action=getsourcecode&address=${IMPL}`,
  method: "GET"
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const parsed = JSON.parse(data);
    console.log("Status:", parsed.status);
    console.log("Message:", parsed.message);
    console.log("Contract name:", parsed.result[0]?.ContractName);
    console.log("Compiler:", parsed.result[0]?.CompilerVersion);
  });
});

req.on("error", e => console.error("Error:", e));
req.end();
