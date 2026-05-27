// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IANSRegistry} from "../interfaces/IANSRegistry.sol";
import {IANSResolver} from "../interfaces/IANSResolver.sol";

/// @title ANSResolver
/// @notice Identity and profile resolution layer for the Arc Name Service.
/// @dev Stores metadata only. Ownership truth always comes from ANSRegistry.
/// @custom:oz-upgrades-unsafe-allow constructor
contract ANSResolver is Initializable, OwnableUpgradeable, UUPSUpgradeable, IANSResolver {

    uint256 public constant MAX_AVATAR_LENGTH  = 512;
    uint256 public constant MAX_BIO_LENGTH     = 320;
    uint256 public constant MAX_WEBSITE_LENGTH = 256;
    uint256 public constant MAX_HANDLE_LENGTH  = 128;
    uint256 public constant MAX_KEY_LENGTH     = 256;
    uint256 public constant MAX_VALUE_LENGTH   = 4096;

    mapping(bytes32 => address) private _addresses;
    mapping(bytes32 => string)  private _avatars;
    mapping(bytes32 => string)  private _bios;
    mapping(bytes32 => string)  private _websites;
    mapping(bytes32 => string)  private _twitters;
    mapping(bytes32 => string)  private _discords;
    mapping(bytes32 => string)  private _emails;
    mapping(bytes32 => mapping(string => string)) private _textRecords;

    IANSRegistry public registry;

    uint256[48] private __gap;

    constructor() {
        _disableInitializers();
    }

    function initialize(address registry_, address protocolAdmin) external initializer {
        if (registry_     == address(0)) revert ZeroAddressResolution(bytes32(0));
        if (protocolAdmin == address(0)) revert ZeroAddressResolution(bytes32(0));
        __Ownable_init();
        _transferOwnership(protocolAdmin);
        __UUPSUpgradeable_init();
        registry = IANSRegistry(registry_);
    }

    modifier onlyNameOwner(bytes32 namehash) {
        _assertNameOwner(namehash, msg.sender);
        _;
    }

    function _assertNameOwner(bytes32 namehash, address caller) internal view {
        if (registry.isExpired(namehash))          revert NameExpiredOrUnregistered(namehash);
        address owner_ = registry.ownerOf(namehash);
        if (owner_ == address(0))                  revert NameExpiredOrUnregistered(namehash);
        if (caller != owner_)                      revert NotNameOwner(namehash, caller);
    }

    function _assertLength(string calldata value, uint256 maxLen, string memory field) internal pure {
        if (bytes(value).length > maxLen) revert FieldTooLong(field, maxLen);
    }

    function setAddress(bytes32 namehash, address wallet) external override onlyNameOwner(namehash) {
        if (wallet == address(0)) revert ZeroAddressResolution(namehash);
        _addresses[namehash] = wallet;
        emit AddressChanged(namehash, wallet);
    }

    function addr(bytes32 namehash) external view override returns (address) {
        return _addresses[namehash];
    }

    function setAvatar(bytes32 namehash, string calldata avatar_) external override onlyNameOwner(namehash) {
        _assertLength(avatar_, MAX_AVATAR_LENGTH, "avatar");
        _avatars[namehash] = avatar_;
        emit AvatarChanged(namehash, avatar_);
    }

    function avatar(bytes32 namehash) external view override returns (string memory) {
        return _avatars[namehash];
    }

    function setBio(bytes32 namehash, string calldata bio_) external override onlyNameOwner(namehash) {
        _assertLength(bio_, MAX_BIO_LENGTH, "bio");
        _bios[namehash] = bio_;
        emit BioChanged(namehash, bio_);
    }

    function bio(bytes32 namehash) external view override returns (string memory) {
        return _bios[namehash];
    }

    function setWebsite(bytes32 namehash, string calldata website_) external override onlyNameOwner(namehash) {
        _assertLength(website_, MAX_WEBSITE_LENGTH, "website");
        _websites[namehash] = website_;
        emit WebsiteChanged(namehash, website_);
    }

    function website(bytes32 namehash) external view override returns (string memory) {
        return _websites[namehash];
    }

    function setTwitter(bytes32 namehash, string calldata twitter_) external override onlyNameOwner(namehash) {
        _assertLength(twitter_, MAX_HANDLE_LENGTH, "twitter");
        _twitters[namehash] = twitter_;
        emit TwitterChanged(namehash, twitter_);
    }

    function twitter(bytes32 namehash) external view override returns (string memory) {
        return _twitters[namehash];
    }

    function setDiscord(bytes32 namehash, string calldata discord_) external override onlyNameOwner(namehash) {
        _assertLength(discord_, MAX_HANDLE_LENGTH, "discord");
        _discords[namehash] = discord_;
        emit DiscordChanged(namehash, discord_);
    }

    function discord(bytes32 namehash) external view override returns (string memory) {
        return _discords[namehash];
    }

    function setEmail(bytes32 namehash, string calldata email_) external override onlyNameOwner(namehash) {
        _assertLength(email_, MAX_HANDLE_LENGTH, "email");
        _emails[namehash] = email_;
        emit EmailChanged(namehash, email_);
    }

    function email(bytes32 namehash) external view override returns (string memory) {
        return _emails[namehash];
    }

    function setText(bytes32 namehash, string calldata key, string calldata value) external override onlyNameOwner(namehash) {
        _assertLength(key,   MAX_KEY_LENGTH,  "key");
        _assertLength(value, MAX_VALUE_LENGTH, "value");
        _textRecords[namehash][key] = value;
        emit TextChanged(namehash, key, value);
    }

    function text(bytes32 namehash, string calldata key) external view override returns (string memory) {
        return _textRecords[namehash][key];
    }

    function profile(bytes32 namehash) external view returns (
        address wallet,
        string memory avatar_,
        string memory bio_,
        string memory website_,
        string memory twitter_,
        string memory discord_,
        string memory email_
    ) {
        wallet   = _addresses[namehash];
        avatar_  = _avatars[namehash];
        bio_     = _bios[namehash];
        website_ = _websites[namehash];
        twitter_ = _twitters[namehash];
        discord_ = _discords[namehash];
        email_   = _emails[namehash];
    }

    function setRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddressResolution(bytes32(0));
        registry = IANSRegistry(newRegistry);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IANSResolver).interfaceId || interfaceId == 0x01ffc9a7;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
