// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArcNameService} from "../ArcNameService.sol";
import {ANSReputation} from "../ANSReputation.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// -----------------------------------------------------------------------
// Handler for nameCount invariant test
// -----------------------------------------------------------------------
contract ANSHandler is Test {
    ArcNameService public ans;
    MockERC20 public usdc;
    ANSReputation public rep;

    // Actors that the handler registers / transfers names for
    address[] public actors;

    // Ghost: track names registered per actor (from handler's perspective)
    mapping(address => uint256) public ghostRegistered;

    // A pool of valid names — pre-seeded to avoid collision and validation issues
    string[] internal _namePool;
    uint256 internal _nameIdx;

    constructor(ArcNameService _ans, MockERC20 _usdc, ANSReputation _rep) {
        ans = _ans;
        usdc = _usdc;
        rep = _rep;

        actors.push(makeAddr("h_alice"));
        actors.push(makeAddr("h_bob"));
        actors.push(makeAddr("h_carol"));

        // Pre-fund actors
        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], 10_000e6);
            vm.prank(actors[i]);
            usdc.approve(address(ans), type(uint256).max);
        }

        // Build a pool of 30 unique valid names (6-char, cheap tier)
        for (uint256 i = 0; i < 30; i++) {
            // names like "nameaa", "nameab", … deterministically
            bytes memory b = new bytes(6);
            b[0] = 0x6e; // n
            b[1] = 0x61; // a
            b[2] = 0x6d; // m
            b[3] = 0x65; // e
            b[4] = bytes1(uint8(0x61 + i / 26));
            b[5] = bytes1(uint8(0x61 + i % 26));
            _namePool.push(string(b));
        }
    }

    function register(uint256 actorIdx, uint256 nameIdx) external {
        actorIdx = bound(actorIdx, 0, actors.length - 1);
        nameIdx = bound(nameIdx, 0, _namePool.length - 1);
        address actor = actors[actorIdx];
        string memory nm = _namePool[nameIdx];

        // Skip if name already active or actor already at cap
        if (!ans.isAvailable(nm)) return;
        if (ans.nameCount(actor) >= 3) return;

        // Mint more USDC if needed
        uint256 price = ans.getPrice(nm, 3);
        if (usdc.balanceOf(actor) < price) {
            usdc.mint(actor, price);
        }

        vm.prank(actor);
        try ans.register(nm, 3) {
            ghostRegistered[actor] += 1;
        } catch {
            // acceptable — contention or cap reached concurrently
        }
    }

    function renewName(uint256 actorIdx, uint256 nameIdx) external {
        actorIdx = bound(actorIdx, 0, actors.length - 1);
        nameIdx = bound(nameIdx, 0, _namePool.length - 1);
        address actor = actors[actorIdx];
        string memory nm = _namePool[nameIdx];

        bytes32 h = keccak256(abi.encodePacked(nm));
        (address recOwner,,) = ans.names(h);
        if (recOwner != actor) return;

        uint256 price = ans.getPrice(nm, 3);
        if (usdc.balanceOf(actor) < price) {
            usdc.mint(actor, price);
        }

        vm.prank(actor);
        try ans.renew(nm, 3) {} catch {}
    }
}

// -----------------------------------------------------------------------
// Unit + fuzz test contract
// -----------------------------------------------------------------------
contract ArcNameServiceTest is Test {
    ArcNameService internal ans;
    ANSReputation internal rep;
    MockERC20 internal usdc;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");

    // Price constants (mirror contract)
    uint256 internal constant P3_3MO  = 5_000000;
    uint256 internal constant P3_6MO  = 9_000000;
    uint256 internal constant P3_9MO  = 12_000000;
    uint256 internal constant P3_12MO = 15_000000;

    uint256 internal constant P4_3MO  = 3_000000;
    uint256 internal constant P4_6MO  = 5_500000;
    uint256 internal constant P4_9MO  = 7_500000;
    uint256 internal constant P4_12MO = 9_000000;

    uint256 internal constant P5_3MO  = 1_500000;
    uint256 internal constant P5_6MO  = 2_750000;
    uint256 internal constant P5_9MO  = 3_750000;
    uint256 internal constant P5_12MO = 4_500000;

    uint256 internal constant P6P_3MO  = 500000;
    uint256 internal constant P6P_6MO  = 900000;
    uint256 internal constant P6P_9MO  = 1_200000;
    uint256 internal constant P6P_12MO = 1_500000;

    uint256 internal constant PROTOCOL_FEE_BPS = 250;
    uint256 internal constant MONTH = 30 days;

    // Convenience: register alice with name "abc" 3 months
    function _registerAlice(string memory name, uint8 dur) internal {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.register(name, dur);
        vm.stopPrank();
    }

    function setUp() public {
        // Deploy mock USDC (6 decimals like real USDC)
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy ANSReputation
        rep = new ANSReputation(admin);

        // Deploy ArcNameService
        ans = new ArcNameService(address(usdc), address(rep), admin);

        // Wire reputation → ANS
        vm.prank(admin);
        rep.setAnsContract(address(ans));

        // Seed balances (10,000 USDC each)
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
        usdc.mint(carol, 100_000e6);
        usdc.mint(stranger, 100_000e6);
    }

    // -----------------------------------------------------------------------
    // Deployment & initialisation
    // -----------------------------------------------------------------------

    function test_Constructor_SetsImmutables() public view {
        assertEq(ans.usdc(), address(usdc));
        assertEq(ans.reputation(), address(rep));
        assertEq(ans.owner(), admin);
    }

    function test_Constructor_RevertsZeroAddresses() public {
        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        new ArcNameService(address(0), address(rep), admin);

        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        new ArcNameService(address(usdc), address(0), admin);

        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        new ArcNameService(address(usdc), address(rep), address(0));
    }

    // -----------------------------------------------------------------------
    // register — pricing for all 4×4 = 16 combinations
    // -----------------------------------------------------------------------

    function test_Register_PricePulled_3Char_3Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abc", 3);
        assertEq(usdc.balanceOf(alice), before - P3_3MO);
        assertEq(usdc.balanceOf(address(ans)), P3_3MO);
    }

    function test_Register_PricePulled_3Char_6Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abc", 6);
        assertEq(usdc.balanceOf(alice), before - P3_6MO);
    }

    function test_Register_PricePulled_3Char_9Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abc", 9);
        assertEq(usdc.balanceOf(alice), before - P3_9MO);
    }

    function test_Register_PricePulled_3Char_12Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abc", 12);
        assertEq(usdc.balanceOf(alice), before - P3_12MO);
    }

    function test_Register_PricePulled_4Char_3Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcd", 3);
        assertEq(usdc.balanceOf(alice), before - P4_3MO);
    }

    function test_Register_PricePulled_4Char_6Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcd", 6);
        assertEq(usdc.balanceOf(alice), before - P4_6MO);
    }

    function test_Register_PricePulled_4Char_9Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcd", 9);
        assertEq(usdc.balanceOf(alice), before - P4_9MO);
    }

    function test_Register_PricePulled_4Char_12Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcd", 12);
        assertEq(usdc.balanceOf(alice), before - P4_12MO);
    }

    function test_Register_PricePulled_5Char_3Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcde", 3);
        assertEq(usdc.balanceOf(alice), before - P5_3MO);
    }

    function test_Register_PricePulled_5Char_6Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcde", 6);
        assertEq(usdc.balanceOf(alice), before - P5_6MO);
    }

    function test_Register_PricePulled_5Char_9Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcde", 9);
        assertEq(usdc.balanceOf(alice), before - P5_9MO);
    }

    function test_Register_PricePulled_5Char_12Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcde", 12);
        assertEq(usdc.balanceOf(alice), before - P5_12MO);
    }

    function test_Register_PricePulled_6PlusChar_3Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcdef", 3);
        assertEq(usdc.balanceOf(alice), before - P6P_3MO);
    }

    function test_Register_PricePulled_6PlusChar_6Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcdef", 6);
        assertEq(usdc.balanceOf(alice), before - P6P_6MO);
    }

    function test_Register_PricePulled_6PlusChar_9Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcdef", 9);
        assertEq(usdc.balanceOf(alice), before - P6P_9MO);
    }

    function test_Register_PricePulled_6PlusChar_12Mo() public {
        uint256 before = usdc.balanceOf(alice);
        _registerAlice("abcdef", 12);
        assertEq(usdc.balanceOf(alice), before - P6P_12MO);
    }

    // -----------------------------------------------------------------------
    // register — nameCount and expiry
    // -----------------------------------------------------------------------

    function test_Register_IncrementsNameCount() public {
        assertEq(ans.nameCount(alice), 0);
        _registerAlice("abc", 3);
        assertEq(ans.nameCount(alice), 1);
        _registerAlice("abcd", 3);
        assertEq(ans.nameCount(alice), 2);
    }

    function test_Register_ExpiryCalculation_3Mo() public {
        uint64 ts = uint64(block.timestamp);
        _registerAlice("abc", 3);
        bytes32 h = keccak256(abi.encodePacked("abc"));
        (,uint64 expiry,) = ans.names(h);
        assertEq(expiry, ts + uint64(3 * MONTH));
    }

    function test_Register_ExpiryCalculation_6Mo() public {
        uint64 ts = uint64(block.timestamp);
        _registerAlice("abcd", 6);
        bytes32 h = keccak256(abi.encodePacked("abcd"));
        (,uint64 expiry,) = ans.names(h);
        assertEq(expiry, ts + uint64(6 * MONTH));
    }

    function test_Register_ExpiryCalculation_9Mo() public {
        uint64 ts = uint64(block.timestamp);
        _registerAlice("abcde", 9);
        bytes32 h = keccak256(abi.encodePacked("abcde"));
        (,uint64 expiry,) = ans.names(h);
        assertEq(expiry, ts + uint64(9 * MONTH));
    }

    function test_Register_ExpiryCalculation_12Mo() public {
        uint64 ts = uint64(block.timestamp);
        _registerAlice("abcdef", 12);
        bytes32 h = keccak256(abi.encodePacked("abcdef"));
        (,uint64 expiry,) = ans.names(h);
        assertEq(expiry, ts + uint64(12 * MONTH));
    }

    function test_Register_EmitsNameRegistered() public {
        uint64 ts = uint64(block.timestamp);
        uint64 expectedExpiry = ts + uint64(3 * MONTH);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.NameRegistered("abc", alice, expectedExpiry);
        ans.register("abc", 3);
        vm.stopPrank();
    }

    function test_Register_SetsPrimaryName_FirstOnly() public {
        _registerAlice("abc", 3);
        assertEq(ans.primaryName(alice), "abc");
        _registerAlice("abcd", 3);
        assertEq(ans.primaryName(alice), "abc"); // unchanged
    }

    function test_Register_CallsReputationSetMemberSince() public {
        _registerAlice("abc", 3);
        ANSReputation.ReputationRecord memory r = rep.getReputation(alice);
        assertEq(r.memberSince, uint64(block.timestamp));
    }

    function test_Register_CallsReputationRecordPurchase() public {
        _registerAlice("abc", 3);
        assertEq(rep.getReputation(alice).purchasesCompleted, 1);
    }

    // -----------------------------------------------------------------------
    // register — revert paths
    // -----------------------------------------------------------------------

    function test_Register_RevertsNameTaken() public {
        _registerAlice("abc", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NameNotAvailable.selector);
        ans.register("abc", 3);
        vm.stopPrank();
    }

    function test_Register_RevertsInvalidChar_Uppercase() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.InvalidName.selector);
        ans.register("Abc", 3);
        vm.stopPrank();
    }

    function test_Register_RevertsInvalidChar_Hyphen() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.InvalidName.selector);
        ans.register("ab-c", 3);
        vm.stopPrank();
    }

    function test_Register_RevertsTooShort() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.InvalidName.selector);
        ans.register("ab", 3);
        vm.stopPrank();
    }

    function test_Register_RevertsTooLong_33Chars() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.InvalidName.selector);
        ans.register("abcdefghijklmnopqrstuvwxyz1234567", 3); // 33 chars
        vm.stopPrank();
    }

    function test_Register_RevertsInvalidDuration() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.InvalidDuration.selector);
        ans.register("abc", 1);
        vm.stopPrank();
    }

    function test_Register_RevertsAtNameCap() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.register("abc", 3);
        ans.register("abcd", 3);
        ans.register("abcde", 3);
        vm.expectRevert(ArcNameService.MaxNamesReached.selector);
        ans.register("abcdef", 3);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // giftName
    // -----------------------------------------------------------------------

    function test_GiftName_RecipientOwnsName() public {
        vm.startPrank(alice); // alice pays, bob receives
        usdc.approve(address(ans), type(uint256).max);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();

        bytes32 h = keccak256(abi.encodePacked("giftme"));
        (address recOwner,,) = ans.names(h);
        assertEq(recOwner, bob);
    }

    function test_GiftName_GifterPays() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), aliceBefore - P6P_3MO);
        assertEq(usdc.balanceOf(bob), bobBefore); // bob pays nothing
    }

    function test_GiftName_RecordsReputation() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();

        // gifter gets recordTipGift
        assertEq(rep.getReputation(alice).tipsGiftsGiven, 1);
        // recipient gets recordPurchase
        assertEq(rep.getReputation(bob).purchasesCompleted, 1);
    }

    function test_GiftName_EmitsNameGifted() public {
        uint64 expectedExpiry = uint64(block.timestamp + 3 * MONTH);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectEmit(true, true, true, true, address(ans));
        emit ArcNameService.NameGifted("giftme", alice, bob, expectedExpiry);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();
    }

    function test_GiftName_NameCountIncrementsForRecipient() public {
        assertEq(ans.nameCount(bob), 0);
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();
        assertEq(ans.nameCount(bob), 1);
    }

    function test_GiftName_RevertsIfNameTaken() public {
        _registerAlice("giftme", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NameNotAvailable.selector);
        ans.giftName("giftme", 3, carol);
        vm.stopPrank();
    }

    function test_GiftName_RevertsIfRecipientAtCap() public {
        // Give bob 3 names first
        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.register("bbb1", 3);
        ans.register("bbb2", 3);
        ans.register("bbb3", 3);
        vm.stopPrank();

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.MaxNamesReached.selector);
        ans.giftName("giftme", 3, bob);
        vm.stopPrank();
    }

    function test_GiftName_RevertsZeroRecipient() public {
        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        ans.giftName("giftme", 3, address(0));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // renew
    // -----------------------------------------------------------------------

    function test_Renew_ExtendsExpiryFromCurrentExpiry() public {
        _registerAlice("renew3", 3);
        bytes32 h = keccak256(abi.encodePacked("renew3"));

        (, uint64 expiryBefore,) = ans.names(h);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.renew("renew3", 3);
        vm.stopPrank();

        (, uint64 expiryAfter,) = ans.names(h);
        assertEq(expiryAfter, expiryBefore + uint64(3 * MONTH));
    }

    function test_Renew_ExtendsFromNowIfExpired() public {
        _registerAlice("renew3", 3);
        bytes32 h = keccak256(abi.encodePacked("renew3"));

        // Fast-forward past expiry
        skip(3 * MONTH + 1);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.renew("renew3", 3);
        vm.stopPrank();

        (, uint64 expiryAfter,) = ans.names(h);
        assertEq(expiryAfter, uint64(block.timestamp) + uint64(3 * MONTH));
    }

    function test_Renew_EmitsNameRenewed() public {
        _registerAlice("renew3", 3);
        bytes32 h = keccak256(abi.encodePacked("renew3"));
        (, uint64 expiryBefore,) = ans.names(h);
        uint64 expectedExpiry = expiryBefore + uint64(3 * MONTH);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectEmit(false, false, false, true, address(ans));
        emit ArcNameService.NameRenewed("renew3", expectedExpiry);
        ans.renew("renew3", 3);
        vm.stopPrank();
    }

    function test_Renew_PullsCorrectPayment() public {
        _registerAlice("renew3", 3);
        uint256 before = usdc.balanceOf(alice);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.renew("renew3", 3);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), before - P6P_3MO);
    }

    function test_Renew_RevertsIfNotOwner() public {
        _registerAlice("renew3", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.renew("renew3", 3);
        vm.stopPrank();
    }

    function test_Renew_CallsReputation() public {
        _registerAlice("renew3", 3);
        uint256 purchasesBefore = rep.getReputation(alice).purchasesCompleted;

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.renew("renew3", 3);
        vm.stopPrank();

        assertEq(rep.getReputation(alice).purchasesCompleted, purchasesBefore + 1);
    }

    // -----------------------------------------------------------------------
    // transferName
    // -----------------------------------------------------------------------

    function test_TransferName_OwnershipChanges() public {
        _registerAlice("tfer1", 3);

        vm.prank(alice);
        ans.transferName("tfer1", bob);

        bytes32 h = keccak256(abi.encodePacked("tfer1"));
        (address newOwner,,) = ans.names(h);
        assertEq(newOwner, bob);
    }

    function test_TransferName_CountersAdjusted() public {
        _registerAlice("tfer1", 3);

        vm.prank(alice);
        ans.transferName("tfer1", bob);

        assertEq(ans.nameCount(alice), 0);
        assertEq(ans.nameCount(bob), 1);
    }

    function test_TransferName_EmitsNameTransferred() public {
        _registerAlice("tfer1", 3);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.NameTransferred("tfer1", alice, bob);
        ans.transferName("tfer1", bob);
    }

    function test_TransferName_RevertsIfNotOwner() public {
        _registerAlice("tfer1", 3);

        vm.prank(bob);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.transferName("tfer1", carol);
    }

    function test_TransferName_RevertsIfExpired() public {
        _registerAlice("tfer1", 3);
        skip(3 * MONTH + 1);

        vm.prank(alice);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.transferName("tfer1", bob);
    }

    function test_TransferName_RevertsIfListed() public {
        _registerAlice("tfer1", 3);

        vm.prank(alice);
        ans.listForSale("tfer1", 100e6);

        vm.prank(alice);
        vm.expectRevert(ArcNameService.NameIsListed.selector);
        ans.transferName("tfer1", bob);
    }

    function test_TransferName_RevertsIfRecipientAtCap() public {
        // Bob registers 3 names first
        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.register("bbb1", 3);
        ans.register("bbb2", 3);
        ans.register("bbb3", 3);
        vm.stopPrank();

        _registerAlice("tfer1", 3);
        vm.prank(alice);
        vm.expectRevert(ArcNameService.MaxNamesReached.selector);
        ans.transferName("tfer1", bob);
    }

    function test_TransferName_RevertsZeroTo() public {
        _registerAlice("tfer1", 3);
        vm.prank(alice);
        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        ans.transferName("tfer1", address(0));
    }

    // -----------------------------------------------------------------------
    // listForSale
    // -----------------------------------------------------------------------

    function test_ListForSale_HappyPath() public {
        _registerAlice("abc", 3);

        vm.prank(alice);
        ans.listForSale("abc", 20e6);

        bytes32 h = keccak256(abi.encodePacked("abc"));
        (,, bool listed) = ans.names(h);
        assertTrue(listed);

        ArcNameService.Listing memory listing = ans.getListing("abc");
        assertEq(listing.seller, alice);
        assertEq(listing.price, 20e6);
        assertTrue(listing.active);
    }

    function test_ListForSale_EmitsNameListed() public {
        _registerAlice("abc", 3);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.NameListed("abc", alice, 20e6);
        ans.listForSale("abc", 20e6);
    }

    function test_ListForSale_RevertsIfNotOwner() public {
        _registerAlice("abc", 3);

        vm.prank(bob);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.listForSale("abc", 20e6);
    }

    function test_ListForSale_RevertsIfExpired() public {
        _registerAlice("abc", 3);
        skip(3 * MONTH + 1);

        vm.prank(alice);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.listForSale("abc", 20e6);
    }

    function test_ListForSale_RevertsZeroPrice() public {
        _registerAlice("abc", 3);

        vm.prank(alice);
        vm.expectRevert(ArcNameService.ZeroPrice.selector);
        ans.listForSale("abc", 0);
    }

    // -----------------------------------------------------------------------
    // cancelListing
    // -----------------------------------------------------------------------

    function test_CancelListing_HappyPath() public {
        _registerAlice("abc", 3);

        vm.prank(alice);
        ans.listForSale("abc", 20e6);

        vm.prank(alice);
        ans.cancelListing("abc");

        bytes32 h = keccak256(abi.encodePacked("abc"));
        (,, bool listed) = ans.names(h);
        assertFalse(listed);

        ArcNameService.Listing memory listing = ans.getListing("abc");
        assertFalse(listing.active);
    }

    function test_CancelListing_EmitsNameListingCancelled() public {
        _registerAlice("abc", 3);
        vm.prank(alice);
        ans.listForSale("abc", 20e6);

        vm.prank(alice);
        vm.expectEmit(false, false, false, true, address(ans));
        emit ArcNameService.NameListingCancelled("abc");
        ans.cancelListing("abc");
    }

    function test_CancelListing_RevertsIfNotOwner() public {
        _registerAlice("abc", 3);
        vm.prank(alice);
        ans.listForSale("abc", 20e6);

        vm.prank(bob);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.cancelListing("abc");
    }

    function test_CancelListing_RevertsIfNotListed() public {
        _registerAlice("abc", 3);

        vm.prank(alice);
        vm.expectRevert(ArcNameService.ListingNotActive.selector);
        ans.cancelListing("abc");
    }

    // -----------------------------------------------------------------------
    // buyName — atomic sale
    // -----------------------------------------------------------------------

    function _setupSale(string memory name, uint256 salePrice) internal {
        _registerAlice(name, 3);
        vm.prank(alice);
        ans.listForSale(name, salePrice);
    }

    function test_BuyName_SellerReceives975Pct() public {
        uint256 salePrice = 100e6;
        _setupSale("abc", salePrice);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        uint256 fee = (salePrice * PROTOCOL_FEE_BPS) / 10_000;
        uint256 sellerProceeds = salePrice - fee;
        assertEq(usdc.balanceOf(alice), aliceBefore + sellerProceeds);
    }

    function test_BuyName_ContractKeeps25Pct() public {
        uint256 salePrice = 100e6;
        _setupSale("abc", salePrice);

        // Contract already holds the registration payment
        uint256 contractBefore = usdc.balanceOf(address(ans));

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        uint256 fee = (salePrice * PROTOCOL_FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(address(ans)), contractBefore + fee);
    }

    function test_BuyName_OwnershipTransfers() public {
        _setupSale("abc", 50e6);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        bytes32 h = keccak256(abi.encodePacked("abc"));
        (address newOwner,,) = ans.names(h);
        assertEq(newOwner, bob);
    }

    function test_BuyName_ListingCleared() public {
        _setupSale("abc", 50e6);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        ArcNameService.Listing memory listing = ans.getListing("abc");
        assertFalse(listing.active);

        bytes32 h = keccak256(abi.encodePacked("abc"));
        (,, bool listed) = ans.names(h);
        assertFalse(listed);
    }

    function test_BuyName_EmitsNameSoldAndTransferred() public {
        uint256 salePrice = 50e6;
        _setupSale("abc", salePrice);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.NameSold("abc", alice, bob, salePrice);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.NameTransferred("abc", alice, bob);
        ans.buyName("abc");
        vm.stopPrank();
    }

    function test_BuyName_ReputationUpdated() public {
        _setupSale("abc", 50e6);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        assertEq(rep.getReputation(alice).salesCompleted, 1);
        assertEq(rep.getReputation(bob).purchasesCompleted, 1);
    }

    function test_BuyName_NameCountAdjusted() public {
        _setupSale("abc", 50e6);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.buyName("abc");
        vm.stopPrank();

        assertEq(ans.nameCount(alice), 0);
        assertEq(ans.nameCount(bob), 1);
    }

    function test_BuyName_RevertsIfListingInactive() public {
        _registerAlice("abc", 3);
        // Not listed

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.ListingNotActive.selector);
        ans.buyName("abc");
        vm.stopPrank();
    }

    function test_BuyName_RevertsIfExpired() public {
        _setupSale("abc", 50e6);
        skip(3 * MONTH + 1);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.buyName("abc");
        vm.stopPrank();
    }

    function test_BuyName_RevertsIfBuyerAtCap() public {
        // Bob already has 3 names
        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.register("bbb1", 3);
        ans.register("bbb2", 3);
        ans.register("bbb3", 3);
        vm.stopPrank();

        _setupSale("abc", 50e6);

        vm.startPrank(bob);
        vm.expectRevert(ArcNameService.MaxNamesReached.selector);
        ans.buyName("abc");
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // sendTip
    // -----------------------------------------------------------------------

    function test_SendTip_USDCPulledFromSenderAndForwarded() public {
        // "tipme" is 5 chars → costs P5_3MO at registration
        _registerAlice("tipme", 3);

        uint256 senderBefore = usdc.balanceOf(bob);
        uint256 recipientBefore = usdc.balanceOf(alice);
        uint256 contractBefore = usdc.balanceOf(address(ans));

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.sendTip("tipme", 10e6, "nice name!");
        vm.stopPrank();

        // Sender paid 10 USDC, recipient received 10 USDC, contract balance unchanged (tip flows through)
        assertEq(usdc.balanceOf(bob), senderBefore - 10e6, "sender balance wrong");
        assertEq(usdc.balanceOf(alice), recipientBefore + 10e6, "recipient balance wrong");
        assertEq(usdc.balanceOf(address(ans)), contractBefore, "contract balance should be unchanged by a tip");
    }

    function test_SendTip_EmitsTipSent() public {
        _registerAlice("tipme", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectEmit(true, true, false, true, address(ans));
        emit ArcNameService.TipSent("tipme", bob, alice, 10e6, "nice!");
        ans.sendTip("tipme", 10e6, "nice!");
        vm.stopPrank();
    }

    function test_SendTip_RecordsReputation() public {
        _registerAlice("tipme", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        ans.sendTip("tipme", 5e6, "");
        vm.stopPrank();

        assertEq(rep.getReputation(bob).tipsGiftsGiven, 1);
    }

    function test_SendTip_RevertsIfNameExpired() public {
        _registerAlice("tipme", 3);
        skip(3 * MONTH + 1);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.sendTip("tipme", 5e6, "");
        vm.stopPrank();
    }

    function test_SendTip_RevertsZeroAmount() public {
        _registerAlice("tipme", 3);

        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.ZeroPrice.selector);
        ans.sendTip("tipme", 0, "");
        vm.stopPrank();
    }

    function test_SendTip_RevertsIfNameNeverRegistered() public {
        vm.startPrank(bob);
        usdc.approve(address(ans), type(uint256).max);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.sendTip("ghost", 5e6, "");
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // withdraw
    // -----------------------------------------------------------------------

    function test_Withdraw_PullsFullUSDCBalance() public {
        _registerAlice("abc", 3);
        uint256 contractBal = usdc.balanceOf(address(ans));

        uint256 adminBefore = usdc.balanceOf(admin);
        vm.prank(admin);
        ans.withdraw();

        assertEq(usdc.balanceOf(address(ans)), 0);
        assertEq(usdc.balanceOf(admin), adminBefore + contractBal);
    }

    function test_Withdraw_RevertsForNonOwner() public {
        _registerAlice("abc", 3);

        vm.prank(stranger);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.withdraw();
    }

    // -----------------------------------------------------------------------
    // transferOwnership
    // -----------------------------------------------------------------------

    function test_TransferOwnership_HappyPath() public {
        vm.prank(admin);
        ans.transferOwnership(alice);
        assertEq(ans.owner(), alice);
    }

    function test_TransferOwnership_EmitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, false, address(ans));
        emit ArcNameService.OwnershipTransferred(admin, alice);
        ans.transferOwnership(alice);
    }

    function test_TransferOwnership_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(ArcNameService.NotNameOwner.selector);
        ans.transferOwnership(alice);
    }

    function test_TransferOwnership_RevertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(ArcNameService.ZeroAddress.selector);
        ans.transferOwnership(address(0));
    }

    // -----------------------------------------------------------------------
    // resolve
    // -----------------------------------------------------------------------

    function test_Resolve_ReturnsCorrectOwner() public {
        _registerAlice("abc", 3);
        assertEq(ans.resolve("abc"), alice);
    }

    function test_Resolve_RevertsIfExpired() public {
        _registerAlice("abc", 3);
        skip(3 * MONTH + 1);
        vm.expectRevert(ArcNameService.NameExpired.selector);
        ans.resolve("abc");
    }

    // -----------------------------------------------------------------------
    // isAvailable
    // -----------------------------------------------------------------------

    function test_IsAvailable_TrueWhenFresh() public view {
        assertTrue(ans.isAvailable("abc"));
    }

    function test_IsAvailable_FalseWhenRegistered() public {
        _registerAlice("abc", 3);
        assertFalse(ans.isAvailable("abc"));
    }

    function test_IsAvailable_TrueWhenExpired() public {
        _registerAlice("abc", 3);
        skip(3 * MONTH + 1);
        assertTrue(ans.isAvailable("abc"));
    }

    // -----------------------------------------------------------------------
    // getPrice
    // -----------------------------------------------------------------------

    function test_GetPrice_ReturnsCorrectValues() public view {
        assertEq(ans.getPrice("abc", 3), P3_3MO);
        assertEq(ans.getPrice("abc", 6), P3_6MO);
        assertEq(ans.getPrice("abc", 9), P3_9MO);
        assertEq(ans.getPrice("abc", 12), P3_12MO);

        assertEq(ans.getPrice("abcd", 3), P4_3MO);
        assertEq(ans.getPrice("abcde", 3), P5_3MO);
        assertEq(ans.getPrice("abcdef", 3), P6P_3MO);
    }

    function test_GetPrice_RevertsInvalidDuration() public {
        vm.expectRevert(ArcNameService.InvalidDuration.selector);
        ans.getPrice("abc", 2);
    }

    function test_GetPrice_RevertsInvalidName() public {
        vm.expectRevert(ArcNameService.InvalidName.selector);
        ans.getPrice("ab", 3);
    }

    // -----------------------------------------------------------------------
    // getNamesByOwner / reverseLookup / getNameRecord
    // -----------------------------------------------------------------------

    function test_GetNamesByOwner_ReturnsOwnedNames() public {
        _registerAlice("abc", 3);
        _registerAlice("abcd", 3);

        string[] memory names = ans.getNamesByOwner(alice);
        assertEq(names.length, 2);
    }

    function test_ReverseLookup_ReturnsPrimaryName() public {
        _registerAlice("abc", 3);
        assertEq(ans.reverseLookup(alice), "abc");
    }

    function test_GetNameRecord_ReturnsRecord() public {
        _registerAlice("abc", 3);
        ArcNameService.NameRecord memory rec = ans.getNameRecord("abc");
        assertEq(rec.owner, alice);
        assertGt(rec.expiry, uint64(block.timestamp));
    }

    // -----------------------------------------------------------------------
    // Fuzz: pricing function correctness across all valid length × duration combos
    // -----------------------------------------------------------------------

    function testFuzz_Pricing_MatchesExpectedTable(uint256 lenSeed, uint8 durSeed) public view {
        // Map lenSeed → valid length category (3,4,5,6+) by picking one name from each
        uint8[4] memory lengths = [3, 4, 5, 6];
        uint8[4] memory durations = [3, 6, 9, 12];

        uint256 lenIdx = bound(lenSeed, 0, 3);
        uint256 durIdx = bound(durSeed, 0, 3);

        uint256 len = lengths[lenIdx];
        uint8 dur = durations[durIdx];

        // Build a name of exactly `len` chars
        bytes memory nm = new bytes(len);
        for (uint256 i = 0; i < len; i++) nm[i] = 0x61; // 'a' * len

        uint256 expected;
        if (len == 3) {
            if (dur == 3) expected = P3_3MO;
            else if (dur == 6) expected = P3_6MO;
            else if (dur == 9) expected = P3_9MO;
            else expected = P3_12MO;
        } else if (len == 4) {
            if (dur == 3) expected = P4_3MO;
            else if (dur == 6) expected = P4_6MO;
            else if (dur == 9) expected = P4_9MO;
            else expected = P4_12MO;
        } else if (len == 5) {
            if (dur == 3) expected = P5_3MO;
            else if (dur == 6) expected = P5_6MO;
            else if (dur == 9) expected = P5_9MO;
            else expected = P5_12MO;
        } else {
            if (dur == 3) expected = P6P_3MO;
            else if (dur == 6) expected = P6P_6MO;
            else if (dur == 9) expected = P6P_9MO;
            else expected = P6P_12MO;
        }

        assertEq(ans.getPrice(string(nm), dur), expected);
    }

    // -----------------------------------------------------------------------
    // Fuzz: fee split never leaves seller shortchanged
    // -----------------------------------------------------------------------

    function testFuzz_BuyName_FeeSplitCorrect(uint256 salePrice) public {
        salePrice = bound(salePrice, 1e6, 1_000_000e6);

        // Mint enough for bob to buy
        usdc.mint(bob, salePrice);

        // Alice registers and lists
        _registerAlice("fuzzme", 3);
        vm.prank(alice);
        ans.listForSale("fuzzme", salePrice);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 contractBefore = usdc.balanceOf(address(ans));

        vm.startPrank(bob);
        usdc.approve(address(ans), salePrice);
        ans.buyName("fuzzme");
        vm.stopPrank();

        uint256 fee = (salePrice * PROTOCOL_FEE_BPS) / 10_000;
        uint256 sellerProceeds = salePrice - fee;

        assertEq(usdc.balanceOf(alice), aliceBefore + sellerProceeds, "seller proceeds mismatch");
        assertEq(usdc.balanceOf(address(ans)), contractBefore + fee, "contract fee mismatch");
    }

    // -----------------------------------------------------------------------
    // Fuzz: register then renew extends expiry by exactly the right duration
    // -----------------------------------------------------------------------

    function testFuzz_Renew_ExpiryExtendedByDuration(uint8 durSeed) public {
        uint8[4] memory valid = [3, 6, 9, 12];
        uint8 dur = valid[bound(durSeed, 0, 3)];

        _registerAlice("renew3", 3);
        bytes32 h = keccak256(abi.encodePacked("renew3"));
        (, uint64 expiryBefore,) = ans.names(h);

        vm.startPrank(alice);
        usdc.approve(address(ans), type(uint256).max);
        ans.renew("renew3", dur);
        vm.stopPrank();

        (, uint64 expiryAfter,) = ans.names(h);
        assertEq(expiryAfter, expiryBefore + uint64(dur) * uint64(MONTH));
    }
}

// -----------------------------------------------------------------------
// Invariant test: nameCount[address] never exceeds 3
// -----------------------------------------------------------------------
contract ArcNameServiceInvariantTest is Test {
    ArcNameService internal ans;
    ANSReputation internal rep;
    MockERC20 internal usdc;
    ANSHandler internal handler;

    address internal admin = makeAddr("invariant_admin");

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        rep = new ANSReputation(admin);
        ans = new ArcNameService(address(usdc), address(rep), admin);

        vm.prank(admin);
        rep.setAnsContract(address(ans));

        handler = new ANSHandler(ans, usdc, rep);

        // Allow handler actors to interact with ANS
        targetContract(address(handler));
    }

    /// @notice nameCount must never exceed 3 for any actor after any sequence of operations.
    /// The handler exposes a public actors(uint256) getter (dynamic array), so we enumerate by index.
    function invariant_NameCountNeverExceedsThree() public view {
        for (uint256 i = 0; i < 3; i++) {
            address actor = handler.actors(i);
            assertLe(ans.nameCount(actor), 3, "nameCount exceeded 3 for actor");
        }
    }
}
