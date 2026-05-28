// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IANSRegistry.sol";

/**
 * @title ANSReverseRegistry
 * @author Arc Name Service
 * @notice Reverse identity layer of the ANS protocol.
 *         Stores: wallet address => primary namehash
 *         Enables explorers, wallets, and dApps to resolve
 *         0xabc... => ebba.arc
 *
 * @dev Architecture position:
 *      ANSRegistry ? ANSResolver ? ANSReverseRegistry
 *
 *      This contract is intentionally lean.
 *      It ONLY manages reverse identity mapping.
 *      Ownership truth always read from ANSRegistry.
 *      No local ownership cache.
 */
contract ANSReverseRegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    // --- Storage --------------------------------------------------------------

    /// @notice ANSRegistry reference for ownership verification
    IANSRegistry public registry;

    /// @dev wallet address => primary namehash
    mapping(address => bytes32) private _primaryNames;

    /// @dev Storage gap for future upgrades
    uint256[50] private __gap;

    // --- Custom Errors --------------------------------------------------------

    error ZeroAddress();
    error ZeroNamehash();
    error NotNameOwner();
    error NameExpiredOrInvalid();
    error NoPrimaryNameSet();

    // --- Events ---------------------------------------------------------------

    event PrimaryNameSet(
        address indexed wallet,
        bytes32 indexed namehash
    );

    event PrimaryNameCleared(
        address indexed wallet
    );

    // --- Constructor ----------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ----------------------------------------------------------

    /**
     * @notice Initialize the reverse registry.
     * @param owner_    Protocol owner address
     * @param registry_ Deployed ANSRegistry address
     */
    function initialize(address owner_, address registry_) external initializer {
        if (owner_    == address(0)) revert ZeroAddress();
        if (registry_ == address(0)) revert ZeroAddress();

        __Ownable_init();
        __UUPSUpgradeable_init();
        _transferOwnership(owner_);

        registry = IANSRegistry(registry_);
    }

    // --- Upgrade Authorization ------------------------------------------------

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    // --- Write Functions ------------------------------------------------------

    /**
     * @notice Set caller wallet primary ANS identity.
     * @dev Verifies ownership via ANSRegistry — not local storage.
     *      Registry is the single source of truth.
     * @param namehash keccak256 namehash of the name to set as primary
     */
    function setPrimaryName(bytes32 namehash) external {
        if (namehash == bytes32(0)) revert ZeroNamehash();

        // Verify caller owns the name in Registry
        if (registry.ownerOf(namehash) != msg.sender) revert NotNameOwner();

        // Verify name is not expired (ownerOf returns address(0) if expired,
        // but double-check exists() for clarity)
        if (!registry.exists(namehash)) revert NameExpiredOrInvalid();

        _primaryNames[msg.sender] = namehash;

        emit PrimaryNameSet(msg.sender, namehash);
    }

    /**
     * @notice Clear caller wallet primary ANS identity.
     * @dev Sets mapping to bytes32(0).
     *      Useful when name is sold, transferred, or privacy needed.
     */
    function clearPrimaryName() external {
        if (_primaryNames[msg.sender] == bytes32(0)) revert NoPrimaryNameSet();

        delete _primaryNames[msg.sender];

        emit PrimaryNameCleared(msg.sender);
    }

    // --- Read Functions -------------------------------------------------------

    /**
     * @notice Resolve wallet address to primary namehash.
     * @dev Returns bytes32(0) if no primary name set or name expired.
     *      Expired names automatically invalidated via Registry check.
     * @param wallet Address to resolve
     * @return namehash Primary namehash, or bytes32(0) if none
     */
    function primaryNameOf(address wallet) external view returns (bytes32) {
        bytes32 namehash = _primaryNames[wallet];
        if (namehash == bytes32(0)) return bytes32(0);

        // Invalidate if name expired in Registry
        if (!registry.exists(namehash)) return bytes32(0);

        return namehash;
    }

    /**
     * @notice Check if a wallet has a primary name set.
     * @dev Also validates name is still active in Registry.
     * @param wallet Address to check
     * @return True if wallet has a valid active primary name
     */
    function hasPrimaryName(address wallet) external view returns (bool) {
        bytes32 namehash = _primaryNames[wallet];
        if (namehash == bytes32(0)) return false;
        return registry.exists(namehash);
    }

    /**
     * @notice Update registry reference (emergency use only).
     * @param newRegistry New ANSRegistry address
     */
    function setRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddress();
        registry = IANSRegistry(newRegistry);
    }
}
