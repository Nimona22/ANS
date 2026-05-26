// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IANSRegistry {
    function setRecord(bytes32 namehash, address owner, address resolver, uint64 expiry) external;
    function renewName(bytes32 namehash, uint64 newExpiry) external;
    function ownerOf(bytes32 namehash) external view returns (address);
    function exists(bytes32 namehash) external view returns (bool);
    function isExpired(bytes32 namehash) external view returns (bool);
    function getRecord(bytes32 namehash) external view returns (address owner, address resolver, uint64 expiry, bool locked);
}
