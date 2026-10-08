// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ANSReputation} from "../ANSReputation.sol";

contract ANSReputationTest is Test {
    ANSReputation internal rep;

    address internal owner = makeAddr("owner");
    address internal ansContract = makeAddr("ansContract");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    // ---------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------

    function setUp() public {
        vm.prank(owner);
        rep = new ANSReputation(owner);

        // Wire ansContract
        vm.prank(owner);
        rep.setAnsContract(ansContract);
    }

    // ---------------------------------------------------------------
    // Deployment & initialisation
    // ---------------------------------------------------------------

    function test_Constructor_SetsOwner() public view {
        assertEq(rep.owner(), owner);
    }

    function test_Constructor_AnsContractZeroInitially() public {
        // Deploy a fresh one to test the pre-wiring state
        vm.prank(owner);
        ANSReputation fresh = new ANSReputation(owner);
        assertEq(fresh.ansContract(), address(0));
    }

    function test_Constructor_RevertsZeroOwner() public {
        vm.expectRevert(ANSReputation.InvalidAddress.selector);
        new ANSReputation(address(0));
    }

    // ---------------------------------------------------------------
    // setAnsContract
    // ---------------------------------------------------------------

    function test_SetAnsContract_HappyPath() public view {
        assertEq(rep.ansContract(), ansContract);
    }

    function test_SetAnsContract_RevertsIfCalledAgain() public {
        vm.prank(owner);
        vm.expectRevert(ANSReputation.AnsContractAlreadySet.selector);
        rep.setAnsContract(makeAddr("other"));
    }

    function test_SetAnsContract_RevertsForNonOwner() public {
        vm.prank(owner);
        ANSReputation fresh = new ANSReputation(owner);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedOwner.selector, stranger));
        fresh.setAnsContract(ansContract);
    }

    function test_SetAnsContract_RevertsZeroAddress() public {
        vm.prank(owner);
        ANSReputation fresh = new ANSReputation(owner);

        vm.prank(owner);
        vm.expectRevert(ANSReputation.InvalidAddress.selector);
        fresh.setAnsContract(address(0));
    }

    // ---------------------------------------------------------------
    // recordSale
    // ---------------------------------------------------------------

    function test_RecordSale_HappyPath() public {
        vm.prank(ansContract);
        rep.recordSale(alice);

        ANSReputation.ReputationRecord memory r = rep.getReputation(alice);
        assertEq(r.salesCompleted, 1);
    }

    function test_RecordSale_RevertsForNonAns() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedAns.selector, stranger));
        rep.recordSale(alice);
    }

    function test_RecordSale_AccumulatesMultiple() public {
        vm.startPrank(ansContract);
        rep.recordSale(alice);
        rep.recordSale(alice);
        rep.recordSale(alice);
        vm.stopPrank();

        assertEq(rep.getReputation(alice).salesCompleted, 3);
    }

    // ---------------------------------------------------------------
    // recordPurchase
    // ---------------------------------------------------------------

    function test_RecordPurchase_HappyPath() public {
        vm.prank(ansContract);
        rep.recordPurchase(alice);

        assertEq(rep.getReputation(alice).purchasesCompleted, 1);
    }

    function test_RecordPurchase_RevertsForNonAns() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedAns.selector, stranger));
        rep.recordPurchase(alice);
    }

    // ---------------------------------------------------------------
    // recordTipGift
    // ---------------------------------------------------------------

    function test_RecordTipGift_HappyPath() public {
        vm.prank(ansContract);
        rep.recordTipGift(alice);

        assertEq(rep.getReputation(alice).tipsGiftsGiven, 1);
    }

    function test_RecordTipGift_RevertsForNonAns() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedAns.selector, stranger));
        rep.recordTipGift(alice);
    }

    // ---------------------------------------------------------------
    // setMemberSince
    // ---------------------------------------------------------------

    function test_SetMemberSince_HappyPath() public {
        uint64 ts = 1_700_000_000;
        vm.prank(ansContract);
        rep.setMemberSince(alice, ts);

        assertEq(rep.getReputation(alice).memberSince, ts);
    }

    function test_SetMemberSince_DoesNotOverwriteExistingTimestamp() public {
        uint64 first = 1_700_000_000;
        uint64 second = 1_800_000_000;

        vm.startPrank(ansContract);
        rep.setMemberSince(alice, first);
        rep.setMemberSince(alice, second); // should be a no-op
        vm.stopPrank();

        assertEq(rep.getReputation(alice).memberSince, first, "memberSince must not be overwritten");
    }

    function test_SetMemberSince_RevertsForNonAns() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedAns.selector, stranger));
        rep.setMemberSince(alice, 12345);
    }

    // ---------------------------------------------------------------
    // flagDispute
    // ---------------------------------------------------------------

    function test_FlagDispute_HappyPath() public {
        vm.prank(owner);
        rep.flagDispute(alice);

        assertEq(rep.getReputation(alice).disputeFlags, 1);
    }

    function test_FlagDispute_AccumulatesMultiple() public {
        vm.startPrank(owner);
        rep.flagDispute(alice);
        rep.flagDispute(alice);
        vm.stopPrank();

        assertEq(rep.getReputation(alice).disputeFlags, 2);
    }

    function test_FlagDispute_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedOwner.selector, stranger));
        rep.flagDispute(alice);
    }

    function test_FlagDispute_RevertsForAnsContract() public {
        vm.prank(ansContract);
        vm.expectRevert(abi.encodeWithSelector(ANSReputation.UnauthorizedOwner.selector, ansContract));
        rep.flagDispute(alice);
    }

    // ---------------------------------------------------------------
    // getTier — boundary tests
    // Tier 0: totalTxs 0..2
    // Tier 1: totalTxs 3..9
    // Tier 2: totalTxs 10..24
    // Tier 3: totalTxs >= 25
    // ---------------------------------------------------------------

    /// @dev Helper: award `n` total transactions (all as purchases for simplicity)
    function _awardTxs(address user, uint256 n) internal {
        vm.startPrank(ansContract);
        for (uint256 i = 0; i < n; i++) {
            rep.recordPurchase(user);
        }
        vm.stopPrank();
    }

    function test_GetTier_Boundary_0Txs_Tier0() public view {
        assertEq(rep.getTier(alice), 0);
    }

    function test_GetTier_Boundary_2Txs_Tier0() public {
        _awardTxs(alice, 2);
        assertEq(rep.getTier(alice), 0);
    }

    function test_GetTier_Boundary_3Txs_Tier1() public {
        _awardTxs(alice, 3);
        assertEq(rep.getTier(alice), 1);
    }

    function test_GetTier_Boundary_9Txs_Tier1() public {
        _awardTxs(alice, 9);
        assertEq(rep.getTier(alice), 1);
    }

    function test_GetTier_Boundary_10Txs_Tier2() public {
        _awardTxs(alice, 10);
        assertEq(rep.getTier(alice), 2);
    }

    function test_GetTier_Boundary_24Txs_Tier2() public {
        _awardTxs(alice, 24);
        assertEq(rep.getTier(alice), 2);
    }

    function test_GetTier_Boundary_25Txs_Tier3() public {
        _awardTxs(alice, 25);
        assertEq(rep.getTier(alice), 3);
    }

    function test_GetTier_MixedTransactionTypes() public {
        // 1 sale + 1 purchase + 1 tip = 3 → Tier 1
        vm.startPrank(ansContract);
        rep.recordSale(alice);
        rep.recordPurchase(alice);
        rep.recordTipGift(alice);
        vm.stopPrank();
        assertEq(rep.getTier(alice), 1);
    }

    // ---------------------------------------------------------------
    // getReputation
    // ---------------------------------------------------------------

    function test_GetReputation_DefaultValues() public view {
        ANSReputation.ReputationRecord memory r = rep.getReputation(stranger);
        assertEq(r.salesCompleted, 0);
        assertEq(r.purchasesCompleted, 0);
        assertEq(r.tipsGiftsGiven, 0);
        assertEq(r.memberSince, 0);
        assertEq(r.disputeFlags, 0);
    }

    function test_GetReputation_AllFieldsPopulated() public {
        vm.startPrank(ansContract);
        rep.recordSale(alice);
        rep.recordPurchase(alice);
        rep.recordTipGift(alice);
        rep.setMemberSince(alice, 999);
        vm.stopPrank();

        vm.prank(owner);
        rep.flagDispute(alice);

        ANSReputation.ReputationRecord memory r = rep.getReputation(alice);
        assertEq(r.salesCompleted, 1);
        assertEq(r.purchasesCompleted, 1);
        assertEq(r.tipsGiftsGiven, 1);
        assertEq(r.memberSince, 999);
        assertEq(r.disputeFlags, 1);
    }

    // ---------------------------------------------------------------
    // Fuzz: getTier is monotone (more txs → tier never decreases)
    // ---------------------------------------------------------------

    function testFuzz_GetTier_Monotone(uint8 txsA, uint8 txsB) public {
        // Ensure txsB >= txsA
        if (txsB < txsA) {
            uint8 tmp = txsA;
            txsA = txsB;
            txsB = tmp;
        }

        _awardTxs(alice, txsA);
        uint8 tierA = rep.getTier(alice);

        _awardTxs(bob, txsB);
        uint8 tierB = rep.getTier(bob);

        assertGe(tierB, tierA, "More txs must yield >= tier");
    }
}
