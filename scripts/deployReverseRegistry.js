const { ethers, upgrades } = require("hardhat");

const REGISTRY_ADDRESS = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  const ANSReverseRegistry = await ethers.getContractFactory("ANSReverseRegistry");

  console.log("Deploying ANSReverseRegistry proxy...");
  const proxy = await upgrades.deployProxy(
    ANSReverseRegistry,
    [deployer.address, REGISTRY_ADDRESS],
    { initializer: "initialize", kind: "uups" }
  );

  await proxy.deployed();

  console.log("ANSReverseRegistry proxy deployed to:", proxy.address);
  console.log("Registry:", await proxy.registry());
  console.log("Owner:",    await proxy.owner());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
