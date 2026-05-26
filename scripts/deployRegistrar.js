const { ethers, upgrades } = require("hardhat");

const REGISTRY_ADDRESS  = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";
const DEFAULT_RESOLVER  = "0x1111111111111111111111111111111111111111";
const TREASURY          = "0xAbB8CfDb703d2300E0f35280C97ed364032106A8";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  const ANSRegistrar = await ethers.getContractFactory("ANSRegistrar");

  console.log("Deploying ANSRegistrar proxy...");
  const proxy = await upgrades.deployProxy(
    ANSRegistrar,
    [deployer.address, REGISTRY_ADDRESS, DEFAULT_RESOLVER, TREASURY],
    { initializer: "initialize", kind: "uups" }
  );

  await proxy.deployed();

  console.log("ANSRegistrar proxy deployed to:", proxy.address);
  console.log("Registry:", await proxy.registry());
  console.log("Treasury:", await proxy.treasury());
  console.log("Owner:",    await proxy.owner());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
