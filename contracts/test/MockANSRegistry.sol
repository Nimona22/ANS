// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IANSRegistry.sol";

contract MockANSRegistry is IANSRegistry {
    mapping(bytes32 => address) private _owners;
    mapping(bytes32 => bool)    private _expired;

    function setOwner(bytes32 namehash, address owner_) external {
        _owners[namehash] = owner_;
    }

    function setExpired(bytes32 namehash, bool expired_) external {
        _expired[namehash] = expired_;
    }

    function ownerOf(bytes32 namehash) external view override returns (address) {
        if (_expired[namehash]) return address(0);
        return _owners[namehash];
    }

    function isExpired(bytes32 namehash) external view override returns (bool) {
        return _expired[namehash];
    }

    function exists(bytes32 namehash) external view override returns (bool) {
        return _owners[namehash] != address(0) && !_expired[namehash];
    }

    function setRecord(bytes32, address, address, uint64) external override {}
    function renewName(bytes32, uint64) external override {}
    function getRecord(bytes32 namehash) external view override returns (address, address, uint64, bool) {
        return (_owners[namehash], address(0), 0, false);
    }
}
