import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("ANSResolver", function () {
  let resolver: any;
  let mockRegistry: any;
  let owner: any, alice: any, bob: any, attacker: any;

  const ALICE_HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("alice.arc"));
  const BOB_HASH   = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("bob.arc"));

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();

    const MockRegistry = await ethers.getContractFactory("MockANSRegistry");
    mockRegistry = await MockRegistry.deploy();
    await mockRegistry.deployed();

    await mockRegistry.setOwner(ALICE_HASH, alice.address);
    await mockRegistry.setOwner(BOB_HASH, bob.address);

    const ANSResolver = await ethers.getContractFactory("ANSResolver");
    resolver = await upgrades.deployProxy(
      ANSResolver,
      [mockRegistry.address, owner.address],
      { initializer: "initialize", kind: "uups" }
    );
    await resolver.deployed();
  });

  it("initialises with correct registry", async function () {
    expect(await resolver.registry()).to.equal(mockRegistry.address);
  });

  it("owner can set and get resolved address", async function () {
    await resolver.connect(alice).setAddress(ALICE_HASH, alice.address);
    expect(await resolver.addr(ALICE_HASH)).to.equal(alice.address);
  });

  it("non-owner cannot set address", async function () {
    await expect(
      resolver.connect(attacker).setAddress(ALICE_HASH, attacker.address)
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");
  });

  it("reverts on zero address", async function () {
    await expect(
      resolver.connect(alice).setAddress(ALICE_HASH, ethers.constants.AddressZero)
    ).to.be.revertedWithCustomError(resolver, "ZeroAddressResolution");
  });

  it("reverts for expired name", async function () {
    await mockRegistry.setExpired(ALICE_HASH, true);
    await expect(
      resolver.connect(alice).setAddress(ALICE_HASH, alice.address)
    ).to.be.revertedWithCustomError(resolver, "NameExpiredOrUnregistered");
  });

  it("owner can set and get avatar", async function () {
    await resolver.connect(alice).setAvatar(ALICE_HASH, "ipfs://QmTest");
    expect(await resolver.avatar(ALICE_HASH)).to.equal("ipfs://QmTest");
  });

  it("owner can set and get bio", async function () {
    await resolver.connect(alice).setBio(ALICE_HASH, "Builder on Arc.");
    expect(await resolver.bio(ALICE_HASH)).to.equal("Builder on Arc.");
  });

  it("owner can set and get website", async function () {
    await resolver.connect(alice).setWebsite(ALICE_HASH, "https://alice.arc");
    expect(await resolver.website(ALICE_HASH)).to.equal("https://alice.arc");
  });

  it("owner can set and get twitter", async function () {
    await resolver.connect(alice).setTwitter(ALICE_HASH, "alice_arc");
    expect(await resolver.twitter(ALICE_HASH)).to.equal("alice_arc");
  });

  it("owner can set and get discord", async function () {
    await resolver.connect(alice).setDiscord(ALICE_HASH, "alice#0001");
    expect(await resolver.discord(ALICE_HASH)).to.equal("alice#0001");
  });

  it("owner can set and get email", async function () {
    await resolver.connect(alice).setEmail(ALICE_HASH, "alice@arc.network");
    expect(await resolver.email(ALICE_HASH)).to.equal("alice@arc.network");
  });

  it("owner can set and get text record", async function () {
    await resolver.connect(alice).setText(ALICE_HASH, "com.github", "alice-arc");
    expect(await resolver.text(ALICE_HASH, "com.github")).to.equal("alice-arc");
  });

  it("owner can clear text record", async function () {
    await resolver.connect(alice).setText(ALICE_HASH, "com.github", "alice-arc");
    await resolver.connect(alice).setText(ALICE_HASH, "com.github", "");
    expect(await resolver.text(ALICE_HASH, "com.github")).to.equal("");
  });

  it("non-owner cannot set text record", async function () {
    await expect(
      resolver.connect(attacker).setText(ALICE_HASH, "key", "val")
    ).to.be.revertedWithCustomError(resolver, "NotNameOwner");
  });

  it("profile() returns all fields in one call", async function () {
    await resolver.connect(alice).setAddress(ALICE_HASH, alice.address);
    await resolver.connect(alice).setAvatar(ALICE_HASH, "ipfs://QmAvatar");
    await resolver.connect(alice).setBio(ALICE_HASH, "Builder.");
    const p = await resolver.profile(ALICE_HASH);
    expect(p.wallet).to.equal(alice.address);
    expect(p.avatar_).to.equal("ipfs://QmAvatar");
    expect(p.bio_).to.equal("Builder.");
  });

  it("rejects avatar exceeding max length", async function () {
    await expect(
      resolver.connect(alice).setAvatar(ALICE_HASH, "a".repeat(513))
    ).to.be.revertedWithCustomError(resolver, "FieldTooLong");
  });

  it("rejects bio exceeding max length", async function () {
    await expect(
      resolver.connect(alice).setBio(ALICE_HASH, "b".repeat(321))
    ).to.be.revertedWithCustomError(resolver, "FieldTooLong");
  });

  it("admin can update registry address", async function () {
    const MockRegistry2 = await ethers.getContractFactory("MockANSRegistry");
    const r2 = await MockRegistry2.deploy();
    await r2.deployed();
    await resolver.connect(owner).setRegistry(r2.address);
    expect(await resolver.registry()).to.equal(r2.address);
  });

  it("non-admin cannot update registry", async function () {
    await expect(
      resolver.connect(attacker).setRegistry(alice.address)
    ).to.be.reverted;
  });
})
