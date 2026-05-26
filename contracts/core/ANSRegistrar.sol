// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IANSRegistry.sol";

contract ANSRegistrar is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // --- Constants ---
    uint256 public constant MIN_NAME_LENGTH = 3;
    uint64  public constant MIN_COMMIT_AGE  = 60;
    uint64  public constant MAX_COMMIT_AGE  = 86400;
    uint64  public constant GRACE_PERIOD    = 30 days;

    uint64  public constant DURATION_3M  = 90 days;
    uint64  public constant DURATION_6M  = 180 days;
    uint64  public constant DURATION_9M  = 270 days;
    uint64  public constant DURATION_12M = 365 days;

    uint256 public constant PRICE_3_CHARS  = 100 ether;
    uint256 public constant PRICE_4_CHARS  = 25 ether;
    uint256 public constant PRICE_5P_CHARS = 5 ether;

    // --- Storage ---
    IANSRegistry public registry;
    address public defaultResolver;
    address public treasury;

    mapping(bytes32 => uint64)  private _commitments;
    mapping(bytes32 => uint64)  private _expiryCache;

    uint256[50] private __gap;

    // --- Errors ---
    error NameTooShort();
    error NameNotAvailable();
    error CommitmentNotFound();
    error CommitmentTooNew();
    error CommitmentExpired();
    error InvalidDuration();
    error InsufficientPayment(uint256 required, uint256 sent);
    error RefundFailed();
    error TreasuryTransferFailed();
    error ZeroAddress();
    error NotInGracePeriod();
    error NameStillActive();
    error InvalidName();

    // --- Events ---
    event NameCommitted(bytes32 indexed commitment, address indexed sender);
    event NameRegistered(bytes32 indexed namehash, string name, address indexed owner, uint64 expiry, uint256 pricePaid);
    event NameRenewed(bytes32 indexed namehash, uint64 newExpiry, uint256 pricePaid);
    event NameReclaimed(bytes32 indexed namehash, string name, address indexed newOwner);
    event TreasuryUpdated(address indexed newTreasury);
    event DefaultResolverUpdated(address indexed newResolver);

    // --- Constructor ---
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ---
    function initialize(
        address owner_,
        address registry_,
        address defaultResolver_,
        address treasury_
    ) external initializer {
        if (owner_           == address(0)) revert ZeroAddress();
        if (registry_        == address(0)) revert ZeroAddress();
        if (defaultResolver_ == address(0)) revert ZeroAddress();
        if (treasury_        == address(0)) revert ZeroAddress();

        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _transferOwnership(owner_);

        registry        = IANSRegistry(registry_);
        defaultResolver = defaultResolver_;
        treasury        = treasury_;
    }

    // --- Upgrade ---
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Commit ---
    function commit(bytes32 commitment) external {
        _commitments[commitment] = uint64(block.timestamp);
        emit NameCommitted(commitment, msg.sender);
    }

    // --- Register ---
    function register(
        string  calldata name,
        address owner,
        bytes32 secret,
        uint64  duration
    ) external payable nonReentrant {
        if (owner == address(0)) revert ZeroAddress();

        bytes memory nameBytes = bytes(name);
        _validateName(nameBytes);
        _validateDuration(duration);

        bytes32 commitment = makeCommitment(name, owner, secret);
        _validateCommitment(commitment);

        bytes32 namehash = _namehash(name);
        if (!_isAvailable(namehash)) revert NameNotAvailable();

        uint256 price = calculatePrice(nameBytes.length, duration);
        if (msg.value < price) revert InsufficientPayment(price, msg.value);

        delete _commitments[commitment];

        uint64 expiry = uint64(block.timestamp) + duration;
        _expiryCache[namehash] = expiry;

        registry.setRecord(namehash, owner, defaultResolver, expiry);

        _collectFee(price);
        if (msg.value > price) _refund(msg.sender, msg.value - price);

        emit NameRegistered(namehash, name, owner, expiry, price);
    }

    // --- Renew ---
    function renew(
        string calldata name,
        uint64 duration
    ) external payable nonReentrant {
        _validateDuration(duration);

        bytes memory nameBytes = bytes(name);
        bytes32 namehash = _namehash(name);

        if (!registry.exists(namehash)) revert NameNotAvailable();

        uint256 price = calculatePrice(nameBytes.length, duration);
        if (msg.value < price) revert InsufficientPayment(price, msg.value);

        (, , uint64 currentExpiry, ) = registry.getRecord(namehash);
        uint64 newExpiry = currentExpiry + duration;

        _expiryCache[namehash] = newExpiry;
        registry.renewName(namehash, newExpiry);

        _collectFee(price);
        if (msg.value > price) _refund(msg.sender, msg.value - price);

        emit NameRenewed(namehash, newExpiry, price);
    }

    // --- Reclaim Expired ---
    function reclaimExpired(
        string  calldata name,
        address owner,
        uint64  duration
    ) external payable nonReentrant {
        if (owner == address(0)) revert ZeroAddress();

        bytes memory nameBytes = bytes(name);
        _validateName(nameBytes);
        _validateDuration(duration);

        bytes32 namehash = _namehash(name);

        if (!registry.isExpired(namehash)) revert NameStillActive();

        uint64 cached = _expiryCache[namehash];
        if (cached > 0 && uint64(block.timestamp) < cached + GRACE_PERIOD) {
            revert NotInGracePeriod();
        }

        uint256 price = calculatePrice(nameBytes.length, duration);
        if (msg.value < price) revert InsufficientPayment(price, msg.value);

        uint64 expiry = uint64(block.timestamp) + duration;
        _expiryCache[namehash] = expiry;

        registry.setRecord(namehash, owner, defaultResolver, expiry);

        _collectFee(price);
        if (msg.value > price) _refund(msg.sender, msg.value - price);

        emit NameReclaimed(namehash, name, owner);
    }

    // --- Views ---
    function available(string calldata name) external view returns (bool) {
        return _isAvailable(_namehash(name));
    }

    function calculatePrice(uint256 nameLength, uint64 duration) public pure returns (uint256) {
        uint256 annualPrice;
        if      (nameLength == 3) annualPrice = PRICE_3_CHARS;
        else if (nameLength == 4) annualPrice = PRICE_4_CHARS;
        else                      annualPrice = PRICE_5P_CHARS;
        return (annualPrice * uint256(duration)) / uint256(365 days);
    }

    function makeCommitment(string calldata name, address owner, bytes32 secret) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(name, owner, secret));
    }

    function namehashOf(string calldata name) external pure returns (bytes32) {
        return _namehash(name);
    }

    function commitmentAge(bytes32 commitment) external view returns (uint64) {
        return _commitments[commitment];
    }

    // --- Admin ---
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setDefaultResolver(address newResolver) external onlyOwner {
        if (newResolver == address(0)) revert ZeroAddress();
        defaultResolver = newResolver;
        emit DefaultResolverUpdated(newResolver);
    }

    // --- Internals ---
    function _namehash(string calldata name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(name));
    }

    function _validateName(bytes memory nameBytes) internal pure {
        if (nameBytes.length < MIN_NAME_LENGTH) revert NameTooShort();
        for (uint256 i = 0; i < nameBytes.length; ) {
            bytes1 c = nameBytes[i];
            bool isLower  = c >= 0x61 && c <= 0x7A;
            bool isDigit  = c >= 0x30 && c <= 0x39;
            bool isHyphen = c == 0x2D;
            if (!isLower && !isDigit && !isHyphen) revert InvalidName();
            unchecked { ++i; }
        }
    }

    function _validateDuration(uint64 duration) internal pure {
        if (
            duration != DURATION_3M  &&
            duration != DURATION_6M  &&
            duration != DURATION_9M  &&
            duration != DURATION_12M
        ) revert InvalidDuration();
    }

    function _validateCommitment(bytes32 commitment) internal view {
        uint64 committedAt = _commitments[commitment];
        if (committedAt == 0) revert CommitmentNotFound();
        uint64 age = uint64(block.timestamp) - committedAt;
        if (age < MIN_COMMIT_AGE) revert CommitmentTooNew();
        if (age > MAX_COMMIT_AGE) revert CommitmentExpired();
    }

    function _isAvailable(bytes32 namehash) internal view returns (bool) {
        if (!registry.exists(namehash)) {
            uint64 cached = _expiryCache[namehash];
            if (cached == 0) return true;
            return uint64(block.timestamp) >= cached + GRACE_PERIOD;
        }
        return false;
    }

    function _collectFee(uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = treasury.call{value: amount}("");
        if (!ok) revert TreasuryTransferFailed();
    }

    function _refund(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert RefundFailed();
    }

    receive() external payable {
        revert("Use register() or renew()");
    }
}
