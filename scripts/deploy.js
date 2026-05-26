const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  const ANSRegistry = await ethers.getContractFactory("ANSRegistry");

  console.log("Deploying ANSRegistry proxy...");
  const proxy = await upgrades.deployProxy(ANSRegistry, [deployer.address], {
    initializer: "initialize",
    kind: "uups",
  });

  await proxy.deployed();

  console.log("Proxy deployed to:", proxy.address);

  const owner = await proxy.owner();
  console.log("Owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
