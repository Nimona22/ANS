// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ANSReputation {
    struct ReputationRecord {
        uint32 salesCompleted;
        uint32 purchasesCompleted;
        uint32 tipsGiftsGiven;
        uint64 memberSince;
        uint16 disputeFlags;
    }

    mapping(address => ReputationRecord) public reputation;
    address public ansContract;
    address public owner;

    error UnauthorizedAns(address caller);
    error UnauthorizedOwner(address caller);
    error AnsContractAlreadySet();
    error InvalidAddress();

    modifier onlyAnsContract() {
        if (msg.sender != ansContract) {
            revert UnauthorizedAns(msg.sender);
        }
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert UnauthorizedOwner(msg.sender);
        }
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert InvalidAddress();
        owner = _owner;
    }

    function setAnsContract(address _ans) external onlyOwner {
        if (ansContract != address(0)) revert AnsContractAlreadySet();
        if (_ans == address(0)) revert InvalidAddress();
        ansContract = _ans;
    }

    function recordSale(address seller) external onlyAnsContract {
        reputation[seller].salesCompleted += 1;
    }

    function recordPurchase(address buyer) external onlyAnsContract {
        reputation[buyer].purchasesCompleted += 1;
    }

    function recordTipGift(address sender) external onlyAnsContract {
        reputation[sender].tipsGiftsGiven += 1;
    }

    function setMemberSince(address user, uint64 ts) external onlyAnsContract {
        ReputationRecord storage rec = reputation[user];
        if (rec.memberSince == 0) {
            rec.memberSince = ts;
        }
    }

    function flagDispute(address user) external onlyOwner {
        reputation[user].disputeFlags += 1;
    }

    function getReputation(address user) external view returns (ReputationRecord memory) {
        return reputation[user];
    }

    function getTier(address user) external view returns (uint8) {
        ReputationRecord storage rec = reputation[user];
        uint256 totalTxs = uint256(rec.salesCompleted) + uint256(rec.purchasesCompleted) + uint256(rec.tipsGiftsGiven);

        if (totalTxs <= 2) return 0;
        if (totalTxs <= 9) return 1;
        if (totalTxs <= 24) return 2;
        return 3;
    }
}
