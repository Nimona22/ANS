const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Find the build info file
const buildInfoDir = "artifacts/build-info";
const buildInfoFile = fs.readdirSync(buildInfoDir)[0];
const buildInfo = JSON.parse(fs.readFileSync(path.join(buildInfoDir, buildInfoFile), "utf8"));

// Create sourcify metadata structure
const metadata = {
  compiler: { version: "0.8.20+commit.a1b79de6" },
  language: "Solidity",
  output: buildInfo.output,
  settings: buildInfo.input.settings,
  sources: buildInfo.input.sources,
  version: 1
};

fs.mkdirSync("sourcify", { recursive: true });
fs.writeFileSync("sourcify/metadata.json", JSON.stringify(metadata, null, 2), "utf8");
console.log("Done - sourcify/metadata.json created");
