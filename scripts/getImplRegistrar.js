const { upgrades } = require("hardhat");

const PROXY = "0xd1C027318d606Ed213c605dEe169BcDB215767a9";

async function main() {
  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("ANSRegistrar Implementation:", impl);
}

main().catch(console.error);
