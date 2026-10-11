// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IANSReputation {
    function setMemberSince(address user, uint64 ts) external;
    function recordPurchase(address user) external;
    function recordTipGift(address user) external;
    function recordSale(address user) external;
}

contract ArcNameService is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct NameRecord {
        address owner;
        uint64 expiry;
        bool listed;
    }

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    // keccak256(name) => record
    mapping(bytes32 => NameRecord) public names;
    // keccak256(name) => listing
    mapping(bytes32 => Listing) public listings;

    // wallet => active-name counter used for fast accounting.
    // NOTE: This counter is intentionally conservative: natural expiry does not auto-decrement
    // without a state-changing interaction, which prevents passive hoarding via stale records.
    mapping(address => uint8) public nameCount;

    // wallet => primary .arc name
    mapping(address => string) public primaryName;

    // wallet => avatar URL
    mapping(address => string) public avatars;

    address public immutable usdc;
    address public immutable reputation;
    address public owner;

    uint256 public constant PROTOCOL_FEE_BPS = 250;

    // owner => currently tracked owned names (max expected small, capped by policy at 3 active)
    mapping(address => string[]) private _ownedNames;
    // owner => name hash => index + 1 in _ownedNames[owner]
    mapping(address => mapping(bytes32 => uint256)) private _ownedNameIndexPlusOne;

    uint256 private constant PRICE_3CHAR_3MO = 5_000000;
    uint256 private constant PRICE_3CHAR_6MO = 9_000000;
    uint256 private constant PRICE_3CHAR_9MO = 12_000000;
    uint256 private constant PRICE_3CHAR_12MO = 15_000000;

    uint256 private constant PRICE_4CHAR_3MO = 3_000000;
    uint256 private constant PRICE_4CHAR_6MO = 5_500000;
    uint256 private constant PRICE_4CHAR_9MO = 7_500000;
    uint256 private constant PRICE_4CHAR_12MO = 9_000000;

    uint256 private constant PRICE_5CHAR_3MO = 1_500000;
    uint256 private constant PRICE_5CHAR_6MO = 2_750000;
    uint256 private constant PRICE_5CHAR_9MO = 3_750000;
    uint256 private constant PRICE_5CHAR_12MO = 4_500000;

    uint256 private constant PRICE_6PLUS_3MO = 500000;
    uint256 private constant PRICE_6PLUS_6MO = 900000;
    uint256 private constant PRICE_6PLUS_9MO = 1_200000;
    uint256 private constant PRICE_6PLUS_12MO = 1_500000;

    error NameNotAvailable();
    error NameExpired();
    error NotNameOwner();
    error MaxNamesReached();
    error InvalidName();
    error InvalidDuration();
    error NameIsListed();
    error ListingNotActive();
    error ZeroPrice();
    error ZeroAddress();

    event NameRegistered(string name, address indexed owner, uint64 expiry);
    event NameRenewed(string name, uint64 newExpiry);
    event NameTransferred(string name, address indexed from, address indexed to);
    event NameGifted(string name, address indexed gifter, address indexed recipient, uint64 expiry);
    event NameListed(string name, address indexed seller, uint256 price);
    event NameSold(string name, address indexed seller, address indexed buyer, uint256 price);
    event NameListingCancelled(string name);
    event TipSent(string toName, address indexed from, address indexed to, uint256 amount, string note);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AvatarSet(address indexed user, string url);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotNameOwner();
        _;
    }

    constructor(address _usdc, address _reputation, address _owner) {
        if (_usdc == address(0) || _reputation == address(0) || _owner == address(0)) revert ZeroAddress();
        usdc = _usdc;
        reputation = _reputation;
        owner = _owner;
    }

    function register(string calldata name, uint8 durationMonths) external nonReentrant {
        _validateName(name);
        _validateDuration(durationMonths);

        bytes32 h = keccak256(abi.encodePacked(name));
        if (!_isAvailableHash(h)) revert NameNotAvailable();
        if (_activeCount(msg.sender) >= 3) revert MaxNamesReached();

        uint256 price = _priceByLengthAndDuration(bytes(name).length, durationMonths);
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), price);

        NameRecord storage existing = names[h];
        address previousOwner = existing.owner;
        if (previousOwner != address(0) && previousOwner != msg.sender) {
            _removeOwnedName(previousOwner, h, name);
            if (nameCount[previousOwner] > 0) {
                unchecked {
                    // safe: nameCount[previousOwner] > 0 is checked above
                    nameCount[previousOwner] -= 1;
                }
            }
            if (_stringEq(primaryName[previousOwner], name)) {
                delete primaryName[previousOwner];
            }
        }

        uint64 expiry = uint64(block.timestamp + _durationToSeconds(durationMonths));
        names[h] = NameRecord({owner: msg.sender, expiry: expiry, listed: false});
        delete listings[h];

        _addOwnedName(msg.sender, h, name);
        nameCount[msg.sender] += 1;

        if (bytes(primaryName[msg.sender]).length == 0) {
            primaryName[msg.sender] = name;
        }

        IANSReputation(reputation).setMemberSince(msg.sender, uint64(block.timestamp));
        IANSReputation(reputation).recordPurchase(msg.sender);

        emit NameRegistered(name, msg.sender, expiry);
    }

    function giftName(string calldata name, uint8 durationMonths, address recipient) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();

        _validateName(name);
        _validateDuration(durationMonths);

        bytes32 h = keccak256(abi.encodePacked(name));
        if (!_isAvailableHash(h)) revert NameNotAvailable();
        if (_activeCount(recipient) >= 3) revert MaxNamesReached();

        uint256 price = _priceByLengthAndDuration(bytes(name).length, durationMonths);
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), price);

        NameRecord storage existing = names[h];
        address previousOwner = existing.owner;
        if (previousOwner != address(0) && previousOwner != recipient) {
            _removeOwnedName(previousOwner, h, name);
            if (nameCount[previousOwner] > 0) {
                unchecked {
                    // safe: nameCount[previousOwner] > 0 is checked above
                    nameCount[previousOwner] -= 1;
                }
            }
            if (_stringEq(primaryName[previousOwner], name)) {
                delete primaryName[previousOwner];
            }
        }

        uint64 expiry = uint64(block.timestamp + _durationToSeconds(durationMonths));
        names[h] = NameRecord({owner: recipient, expiry: expiry, listed: false});
        delete listings[h];

        _addOwnedName(recipient, h, name);
        nameCount[recipient] += 1;

        if (bytes(primaryName[recipient]).length == 0) {
            primaryName[recipient] = name;
        }

        IANSReputation(reputation).setMemberSince(recipient, uint64(block.timestamp));
        IANSReputation(reputation).recordPurchase(recipient);
        IANSReputation(reputation).recordTipGift(msg.sender);

        emit NameGifted(name, msg.sender, recipient, expiry);
    }

    function renew(string calldata name, uint8 durationMonths) external nonReentrant {
        _validateName(name);
        _validateDuration(durationMonths);

        bytes32 h = keccak256(abi.encodePacked(name));
        NameRecord storage rec = names[h];
        if (rec.owner != msg.sender) revert NotNameOwner();

        uint256 price = _priceByLengthAndDuration(bytes(name).length, durationMonths);
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), price);

        uint64 base = rec.expiry > block.timestamp ? rec.expiry : uint64(block.timestamp);
        uint64 newExpiry = base + uint64(_durationToSeconds(durationMonths));
        rec.expiry = newExpiry;

        IANSReputation(reputation).recordPurchase(msg.sender);

        emit NameRenewed(name, newExpiry);
    }

    function transferName(string calldata name, address to) external {
        if (to == address(0)) revert ZeroAddress();

        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        NameRecord storage rec = names[h];

        if (rec.owner != msg.sender) revert NotNameOwner();
        if (rec.expiry <= block.timestamp) revert NameExpired();
        if (rec.listed) revert NameIsListed();
        if (_activeCount(to) >= 3) revert MaxNamesReached();

        rec.owner = to;

        _removeOwnedName(msg.sender, h, name);
        _addOwnedName(to, h, name);

        if (nameCount[msg.sender] > 0) {
            unchecked {
                // safe: nameCount[msg.sender] > 0 is checked above
                nameCount[msg.sender] -= 1;
            }
        }
        nameCount[to] += 1;

        if (_stringEq(primaryName[msg.sender], name)) {
            delete primaryName[msg.sender];
        }
        if (bytes(primaryName[to]).length == 0) {
            primaryName[to] = name;
        }

        emit NameTransferred(name, msg.sender, to);
    }

    function listForSale(string calldata name, uint256 price) external {
        if (price == 0) revert ZeroPrice();

        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        NameRecord storage rec = names[h];

        if (rec.owner != msg.sender) revert NotNameOwner();
        if (rec.expiry <= block.timestamp) revert NameExpired();

        listings[h] = Listing({seller: msg.sender, price: price, active: true});
        rec.listed = true;

        emit NameListed(name, msg.sender, price);
    }

    function cancelListing(string calldata name) external {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        NameRecord storage rec = names[h];
        Listing storage listing = listings[h];

        if (rec.owner != msg.sender) revert NotNameOwner();
        if (!listing.active) revert ListingNotActive();

        delete listings[h];
        rec.listed = false;

        emit NameListingCancelled(name);
    }

    function buyName(string calldata name) external nonReentrant {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));

        NameRecord storage rec = names[h];
        Listing memory listing = listings[h];

        if (!listing.active) revert ListingNotActive();
        if (rec.expiry <= block.timestamp) revert NameExpired();
        if (_activeCount(msg.sender) >= 3) revert MaxNamesReached();
        if (listing.price == 0) revert ZeroPrice();

        address seller = listing.seller;
        if (rec.owner != seller) revert NotNameOwner();

        IERC20 token = IERC20(usdc);
        token.safeTransferFrom(msg.sender, address(this), listing.price);

        uint256 fee = (listing.price * PROTOCOL_FEE_BPS) / 10_000;
        uint256 sellerProceeds = listing.price - fee;
        token.safeTransfer(seller, sellerProceeds);

        rec.owner = msg.sender;
        rec.listed = false;
        delete listings[h];

        _removeOwnedName(seller, h, name);
        _addOwnedName(msg.sender, h, name);

        if (nameCount[seller] > 0) {
            unchecked {
                // safe: nameCount[seller] > 0 is checked above
                nameCount[seller] -= 1;
            }
        }
        nameCount[msg.sender] += 1;

        if (_stringEq(primaryName[seller], name)) {
            delete primaryName[seller];
        }
        if (bytes(primaryName[msg.sender]).length == 0) {
            primaryName[msg.sender] = name;
        }

        IANSReputation(reputation).recordSale(seller);
        IANSReputation(reputation).recordPurchase(msg.sender);

        emit NameSold(name, seller, msg.sender, listing.price);
        emit NameTransferred(name, seller, msg.sender);
    }

    function sendTip(string calldata toName, uint256 amount, string calldata note) external nonReentrant {
        if (amount == 0) revert ZeroPrice();

        _validateName(toName);
        bytes32 h = keccak256(abi.encodePacked(toName));
        NameRecord memory rec = names[h];

        if (rec.owner == address(0) || rec.expiry <= block.timestamp) revert NameExpired();

        IERC20 token = IERC20(usdc);
        token.safeTransferFrom(msg.sender, address(this), amount);
        token.safeTransfer(rec.owner, amount);

        IANSReputation(reputation).recordTipGift(msg.sender);

        emit TipSent(toName, msg.sender, rec.owner, amount, note);
    }

    function resolve(string calldata name) external view returns (address) {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        NameRecord memory rec = names[h];

        if (rec.owner == address(0) || rec.expiry <= block.timestamp) revert NameExpired();
        return rec.owner;
    }

    function isAvailable(string calldata name) external view returns (bool) {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        return _isAvailableHash(h);
    }

    function getPrice(string calldata name, uint8 durationMonths) external pure returns (uint256) {
        _validateDuration(durationMonths);
        uint256 len = bytes(name).length;
        if (len < 3 || len > 32) revert InvalidName();
        return _priceByLengthAndDuration(len, durationMonths);
    }

    function getNamesByOwner(address user) external view returns (string[] memory) {
        string[] storage tracked = _ownedNames[user];
        uint256 trackedLen = tracked.length;

        uint256 active;
        for (uint256 i = 0; i < trackedLen; i++) {
            bytes32 h = keccak256(abi.encodePacked(tracked[i]));
            NameRecord memory rec = names[h];
            if (rec.owner == user && rec.expiry > block.timestamp) {
                active++;
            }
        }

        string[] memory result = new string[](active);
        uint256 idx;
        for (uint256 i = 0; i < trackedLen; i++) {
            bytes32 h = keccak256(abi.encodePacked(tracked[i]));
            NameRecord memory rec = names[h];
            if (rec.owner == user && rec.expiry > block.timestamp) {
                result[idx] = tracked[i];
                idx++;
            }
        }

        return result;
    }

    function getListing(string calldata name) external view returns (Listing memory) {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        return listings[h];
    }

    function reverseLookup(address user) external view returns (string memory) {
        return primaryName[user];
    }

    function setAvatar(string calldata url) external {
        avatars[msg.sender] = url;
        emit AvatarSet(msg.sender, url);
    }

    function getNameRecord(string calldata name) external view returns (NameRecord memory) {
        _validateName(name);
        bytes32 h = keccak256(abi.encodePacked(name));
        return names[h];
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        IERC20(usdc).safeTransfer(owner, bal);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function _isAvailableHash(bytes32 h) internal view returns (bool) {
        NameRecord memory rec = names[h];
        return rec.owner == address(0) || rec.expiry <= block.timestamp;
    }

    function _validateDuration(uint8 durationMonths) internal pure {
        if (durationMonths != 3 && durationMonths != 6 && durationMonths != 9 && durationMonths != 12) {
            revert InvalidDuration();
        }
    }

    function _durationToSeconds(uint8 durationMonths) internal pure returns (uint256) {
        return uint256(durationMonths) * 30 days;
    }

    function _validateName(string calldata name) internal pure {
        bytes calldata b = bytes(name);
        uint256 len = b.length;
        if (len < 3 || len > 32) revert InvalidName();

        for (uint256 i = 0; i < len; i++) {
            bytes1 ch = b[i];
            bool isLower = ch >= 0x61 && ch <= 0x7A; // a-z
            bool isDigit = ch >= 0x30 && ch <= 0x39; // 0-9
            if (!isLower && !isDigit) revert InvalidName();
        }
    }

    function _priceByLengthAndDuration(uint256 len, uint8 durationMonths) internal pure returns (uint256) {
        if (len == 3) {
            if (durationMonths == 3) return PRICE_3CHAR_3MO;
            if (durationMonths == 6) return PRICE_3CHAR_6MO;
            if (durationMonths == 9) return PRICE_3CHAR_9MO;
            return PRICE_3CHAR_12MO;
        }

        if (len == 4) {
            if (durationMonths == 3) return PRICE_4CHAR_3MO;
            if (durationMonths == 6) return PRICE_4CHAR_6MO;
            if (durationMonths == 9) return PRICE_4CHAR_9MO;
            return PRICE_4CHAR_12MO;
        }

        if (len == 5) {
            if (durationMonths == 3) return PRICE_5CHAR_3MO;
            if (durationMonths == 6) return PRICE_5CHAR_6MO;
            if (durationMonths == 9) return PRICE_5CHAR_9MO;
            return PRICE_5CHAR_12MO;
        }

        if (durationMonths == 3) return PRICE_6PLUS_3MO;
        if (durationMonths == 6) return PRICE_6PLUS_6MO;
        if (durationMonths == 9) return PRICE_6PLUS_9MO;
        return PRICE_6PLUS_12MO;
    }

    function _addOwnedName(address user, bytes32 h, string calldata name) internal {
        if (_ownedNameIndexPlusOne[user][h] != 0) return;
        _ownedNames[user].push(name);
        _ownedNameIndexPlusOne[user][h] = _ownedNames[user].length;
    }

    function _removeOwnedName(address user, bytes32 h, string calldata name) internal {
        uint256 idxPlusOne = _ownedNameIndexPlusOne[user][h];
        if (idxPlusOne == 0) {
            // Fallback for old records that were never indexed (defensive)
            string[] storage arrSearch = _ownedNames[user];
            for (uint256 i = 0; i < arrSearch.length; i++) {
                if (_stringEq(arrSearch[i], name)) {
                    idxPlusOne = i + 1;
                    break;
                }
            }
            if (idxPlusOne == 0) return;
        }

        string[] storage arr = _ownedNames[user];
        uint256 idx = idxPlusOne - 1;
        uint256 last = arr.length - 1;

        if (idx != last) {
            string memory lastName = arr[last];
            bytes32 lastHash = keccak256(abi.encodePacked(lastName));
            arr[idx] = lastName;
            _ownedNameIndexPlusOne[user][lastHash] = idx + 1;
        }

        arr.pop();
        delete _ownedNameIndexPlusOne[user][h];

        // Max active names per user is 3, so active checks are O(3) in practice.
        // Expired/stale historical entries can still accumulate, so prune eagerly on removals.
        uint256 i;
        while (i < arr.length) {
            bytes32 trackedHash = keccak256(abi.encodePacked(arr[i]));
            NameRecord memory trackedRec = names[trackedHash];
            if (trackedRec.owner != user || trackedRec.expiry <= block.timestamp) {
                uint256 pruneLast = arr.length - 1;
                if (i != pruneLast) {
                    string memory swapName = arr[pruneLast];
                    bytes32 swapHash = keccak256(abi.encodePacked(swapName));
                    arr[i] = swapName;
                    _ownedNameIndexPlusOne[user][swapHash] = i + 1;
                }
                arr.pop();
                delete _ownedNameIndexPlusOne[user][trackedHash];
                continue;
            }
            i++;
        }
    }

    function _activeCount(address user) internal view returns (uint256 count) {
        string[] storage tracked = _ownedNames[user];
        for (uint256 i = 0; i < tracked.length; i++) {
            bytes32 h = keccak256(abi.encodePacked(tracked[i]));
            NameRecord memory rec = names[h];
            if (rec.owner == user && rec.expiry > block.timestamp) {
                count++;
            }
        }
    }

    function _stringEq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
