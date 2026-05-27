// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IANSResolver {
    event AddressChanged(bytes32 indexed namehash, address indexed newAddress);
    event AvatarChanged(bytes32 indexed namehash, string avatar);
    event BioChanged(bytes32 indexed namehash, string bio);
    event WebsiteChanged(bytes32 indexed namehash, string website);
    event TwitterChanged(bytes32 indexed namehash, string twitter);
    event DiscordChanged(bytes32 indexed namehash, string discord);
    event EmailChanged(bytes32 indexed namehash, string email);
    event TextChanged(bytes32 indexed namehash, string indexed key, string value);

    error NotNameOwner(bytes32 namehash, address caller);
    error ZeroAddressResolution(bytes32 namehash);
    error NameExpiredOrUnregistered(bytes32 namehash);
    error FieldTooLong(string field, uint256 maxLength);

    function setAddress(bytes32 namehash, address wallet) external;
    function addr(bytes32 namehash) external view returns (address);
    function setAvatar(bytes32 namehash, string calldata avatar) external;
    function avatar(bytes32 namehash) external view returns (string memory);
    function setBio(bytes32 namehash, string calldata bio) external;
    function bio(bytes32 namehash) external view returns (string memory);
    function setWebsite(bytes32 namehash, string calldata website) external;
    function website(bytes32 namehash) external view returns (string memory);
    function setTwitter(bytes32 namehash, string calldata twitter) external;
    function twitter(bytes32 namehash) external view returns (string memory);
    function setDiscord(bytes32 namehash, string calldata discord) external;
    function discord(bytes32 namehash) external view returns (string memory);
    function setEmail(bytes32 namehash, string calldata email) external;
    function email(bytes32 namehash) external view returns (string memory);
    function setText(bytes32 namehash, string calldata key, string calldata value) external;
    function text(bytes32 namehash, string calldata key) external view returns (string memory);
}
