const fs = require("fs");

const files = fs.readdirSync("artifacts/build-info");
const buildInfo = JSON.parse(fs.readFileSync("artifacts/build-info/" + files[0], "utf8"));

const input = buildInfo.input;
input.settings.outputSelection = {
  "contracts/core/ANSRegistrar.sol": {
    "ANSRegistrar": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "metadata"]
  }
};

fs.writeFileSync("registrar-input.json", JSON.stringify(input, null, 2), "utf8");
console.log("Done. Size:", JSON.stringify(input).length);
