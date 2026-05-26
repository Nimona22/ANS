// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ANSRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable {

    // --- Storage --------------------------------------------------------------

    struct NameRecord {
        address owner;
        address resolver;
        uint64  expiry;
        bool    locked;
    }

    mapping(bytes32 => NameRecord) private _records;
    mapping(address => bytes32)    private _primaryNames;
    mapping(address => bool)       private _registrars;

    // --- Custom Errors --------------------------------------------------------

    error NotAuthorized();
    error NameNotFound();
    error NameExpired();
    error NameLocked();
    error ZeroAddress();
    error InvalidExpiry();
    error NotRegistrar();

    // --- Events ---------------------------------------------------------------

    event NameRegistered(bytes32 indexed namehash, address indexed owner, address resolver, uint64 expiry);
    event NameTransferred(bytes32 indexed namehash, address indexed previousOwner, address indexed newOwner);
    event ResolverUpdated(bytes32 indexed namehash, address indexed resolver);
    event PrimaryNameUpdated(address indexed wallet, bytes32 indexed namehash);
    event NameRenewed(bytes32 indexed namehash, uint64 newExpiry);
    event LockStatusChanged(bytes32 indexed namehash, bool locked);
    event RegistrarUpdated(address indexed registrar, bool authorized);

    // --- Modifiers ------------------------------------------------------------

    modifier onlyNameOwner(bytes32 namehash) {
        if (_records[namehash].owner != msg.sender) revert NotAuthorized();
        _;
    }

    modifier nameExists(bytes32 namehash) {
        if (_records[namehash].owner == address(0)) revert NameNotFound();
        _;
    }

    modifier notExpired(bytes32 namehash) {
        if (block.timestamp > _records[namehash].expiry) revert NameExpired();
        _;
    }

    modifier notLocked(bytes32 namehash) {
        if (_records[namehash].locked) revert NameLocked();
        _;
    }

    modifier onlyRegistrar() {
        if (!_registrars[msg.sender]) revert NotRegistrar();
        _;
    }

    // --- Constructor ----------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ----------------------------------------------------------

    function initialize(address owner_) external initializer {
        if (owner_ == address(0)) revert ZeroAddress();
        __Ownable_init();
        __UUPSUpgradeable_init();
        _transferOwnership(owner_);
    }

    // --- Upgrade Authorization ------------------------------------------------

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Registrar Management -------------------------------------------------

    function setRegistrar(address registrar, bool authorized) external onlyOwner {
        if (registrar == address(0)) revert ZeroAddress();
        _registrars[registrar] = authorized;
        emit RegistrarUpdated(registrar, authorized);
    }

    // --- Write Functions ------------------------------------------------------

    function setRecord(bytes32 namehash, address owner, address resolver, uint64 expiry) external onlyRegistrar {
        if (owner    == address(0)) revert ZeroAddress();
        if (resolver == address(0)) revert ZeroAddress();
        if (expiry   <= block.timestamp) revert InvalidExpiry();
        _records[namehash] = NameRecord({ owner: owner, resolver: resolver, expiry: expiry, locked: false });
        emit NameRegistered(namehash, owner, resolver, expiry);
    }

    function setResolver(bytes32 namehash, address resolver)
        external onlyNameOwner(namehash) nameExists(namehash) notExpired(namehash) notLocked(namehash)
    {
        if (resolver == address(0)) revert ZeroAddress();
        _records[namehash].resolver = resolver;
        emit ResolverUpdated(namehash, resolver);
    }

    function setPrimaryName(bytes32 namehash) external {
        if (namehash != bytes32(0)) {
            if (_records[namehash].owner != msg.sender) revert NotAuthorized();
            if (_records[namehash].owner == address(0)) revert NameNotFound();
            if (block.timestamp > _records[namehash].expiry) revert NameExpired();
        }
        _primaryNames[msg.sender] = namehash;
        emit PrimaryNameUpdated(msg.sender, namehash);
    }

    function setLock(bytes32 namehash, bool locked)
        external onlyNameOwner(namehash) nameExists(namehash) notExpired(namehash)
    {
        _records[namehash].locked = locked;
        emit LockStatusChanged(namehash, locked);
    }

    function transferName(bytes32 namehash, address newOwner)
        external onlyNameOwner(namehash) nameExists(namehash) notExpired(namehash) notLocked(namehash)
    {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = _records[namehash].owner;
        _records[namehash].owner = newOwner;
        if (_primaryNames[previousOwner] == namehash) {
            delete _primaryNames[previousOwner];
            emit PrimaryNameUpdated(previousOwner, bytes32(0));
        }
        emit NameTransferred(namehash, previousOwner, newOwner);
    }

    function renewName(bytes32 namehash, uint64 newExpiry) external onlyRegistrar nameExists(namehash) {
        if (newExpiry <= _records[namehash].expiry) revert InvalidExpiry();
        _records[namehash].expiry = newExpiry;
        emit NameRenewed(namehash, newExpiry);
    }

    // --- Read Functions -------------------------------------------------------

    function isExpired(bytes32 namehash) external view returns (bool) {
        return block.timestamp > _records[namehash].expiry;
    }

    function ownerOf(bytes32 namehash) external view returns (address) {
        if (block.timestamp > _records[namehash].expiry) return address(0);
        return _records[namehash].owner;
    }

    function resolverOf(bytes32 namehash) external view returns (address) {
        if (block.timestamp > _records[namehash].expiry) return address(0);
        return _records[namehash].resolver;
    }

    function primaryNameOf(address wallet) external view returns (bytes32) {
        bytes32 namehash = _primaryNames[wallet];
        if (namehash == bytes32(0)) return bytes32(0);
        if (block.timestamp > _records[namehash].expiry) return bytes32(0);
        return namehash;
    }

    function exists(bytes32 namehash) external view returns (bool) {
        NameRecord storage record = _records[namehash];
        return record.owner != address(0) && block.timestamp <= record.expiry;
    }

    function getRecord(bytes32 namehash) external view returns (address owner, address resolver, uint64 expiry, bool locked) {
        NameRecord storage record = _records[namehash];
        return (record.owner, record.resolver, record.expiry, record.locked);
    }

    function isRegistrar(address registrar) external view returns (bool) {
        return _registrars[registrar];
    }
}
