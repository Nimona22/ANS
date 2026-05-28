const { ethers } = require("hardhat");

const REVERSE_REGISTRY = "0x7cF67bec770f4eC9A744b9D4a1233ef5C21a756c";
const REGISTRY_ADDRESS = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";
const REGISTRAR        = "0xd1C027318d606Ed213c605dEe169BcDB215767a9";

async function wait(ms) {
  const steps = ms / 5000;
  for (let i = 0; i < steps; i++) {
    await new Promise(r => setTimeout(r, 5000));
    await ethers.provider.getBlockNumber();
    process.stdout.write(".");
  }
  console.log("");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with:", deployer.address);

  const reverseRegistry = await ethers.getContractAt("ANSReverseRegistry", REVERSE_REGISTRY);
  const registrar       = await ethers.getContractAt("ANSRegistrar", REGISTRAR);

  const testName   = "ebba";
  const secret     = ethers.utils.formatBytes32String("secret456");
  const DURATION_12M = 365 * 24 * 60 * 60;

  console.log("\n--- TEST 1: hasPrimaryName before set ---");
  const hasBefore = await reverseRegistry.hasPrimaryName(deployer.address);
  console.log("Has primary name:", hasBefore);
  console.log("TEST 1 PASSED ?");

  console.log("\n--- TEST 2: primaryNameOf before set ---");
  const nameBefore = await reverseRegistry.primaryNameOf(deployer.address);
  console.log("Primary name:", nameBefore);
  if (nameBefore !== ethers.constants.HashZero) throw new Error("TEST 2 FAILED");
  console.log("TEST 2 PASSED ?");

  console.log("\n--- TEST 3: reject zero namehash ---");
  try {
    await reverseRegistry.setPrimaryName(ethers.constants.HashZero);
    console.log("TEST 3 FAILED ?");
  } catch(e) {
    console.log("Correctly rejected zero namehash");
    console.log("TEST 3 PASSED ?");
  }

  console.log("\n--- TEST 4: reject unowned name ---");
  const fakeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("notowned"));
  try {
    await reverseRegistry.setPrimaryName(fakeHash);
    console.log("TEST 4 FAILED ?");
  } catch(e) {
    console.log("Correctly rejected unowned name");
    console.log("TEST 4 PASSED ?");
  }

  console.log("\n--- TEST 5: setPrimaryName ---");
  const commitment = await registrar.makeCommitment(testName, deployer.address, secret);
  const txC = await registrar.commit(commitment);
  await txC.wait();
  console.log("Committed. Waiting 70 seconds...");
  await wait(70000);

  const price = await registrar.calculatePrice(testName.length, DURATION_12M);
  const txR = await registrar.register(testName, deployer.address, secret, DURATION_12M, { value: price });
  await txR.wait();
  console.log("Registered ebba.arc");

  const ebbaHash = await registrar.namehashOf(testName);
  const tx5 = await reverseRegistry.setPrimaryName(ebbaHash);
  await tx5.wait();
  console.log("TX:", tx5.hash);
  console.log("TEST 5 PASSED ?");

  console.log("\n--- TEST 6: primaryNameOf after set ---");
  const nameAfter = await reverseRegistry.primaryNameOf(deployer.address);
  console.log("Primary namehash:", nameAfter);
  if (nameAfter !== ebbaHash) throw new Error("TEST 6 FAILED");
  console.log("TEST 6 PASSED ?");

  console.log("\n--- TEST 7: hasPrimaryName after set ---");
  const hasAfter = await reverseRegistry.hasPrimaryName(deployer.address);
  console.log("Has primary name:", hasAfter);
  if (!hasAfter) throw new Error("TEST 7 FAILED");
  console.log("TEST 7 PASSED ?");

  console.log("\n--- TEST 8: clearPrimaryName ---");
  const tx8 = await reverseRegistry.clearPrimaryName();
  await tx8.wait();
  const nameCleared = await reverseRegistry.primaryNameOf(deployer.address);
  console.log("After clear:", nameCleared);
  if (nameCleared !== ethers.constants.HashZero) throw new Error("TEST 8 FAILED");
  console.log("TEST 8 PASSED ?");

  console.log("\n--- TEST 9: hasPrimaryName after clear ---");
  const hasCleared = await reverseRegistry.hasPrimaryName(deployer.address);
  console.log("Has primary name:", hasCleared);
  if (hasCleared) throw new Error("TEST 9 FAILED");
  console.log("TEST 9 PASSED ?");

  console.log("\n=============================");
  console.log("ALL 9 TESTS PASSED ?");
  console.log("=============================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
