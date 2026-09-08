// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./interfaces/IERC20.sol";

/**
 * @title GameEscrow
 * @notice USDC escrow for Civil Sarabande games (v2).
 *
 * Each player escrows exactly `stake` USDC: player 1 on `createGame`, player 2
 * on `joinGame`. The game itself is played off-chain. When it ends the server
 * settles once with `settleGame`, splitting the pot between the two players.
 *
 * Player escape hatches that never need the server:
 *  - `withdrawUnjoined`: player 1 takes their stake back while nobody has joined.
 *  - `claimTimeout`: either player refunds both stakes if the server has not
 *    settled within `SETTLEMENT_TIMEOUT` of the game becoming active.
 *
 * The contract has no external dependencies beyond the local `IERC20`.
 * `usdcToken` is immutable; `serverAddress` is rotatable by the owner.
 */
contract GameEscrow {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice Lifecycle of a game. `None` means the id has never been used.
    enum Status {
        None,
        Created,
        Active,
        Settled,
        Cancelled,
        TimedOut
    }

    /// @notice Per-game escrow record.
    struct Game {
        /// @dev Creator; funds `stake` on `createGame`.
        address player1;
        /// @dev Joiner; funds `stake` on `joinGame`. Zero until joined.
        address player2;
        /// @dev Per-player stake in USDC base units (6 decimals).
        uint256 stake;
        /// @dev Funds currently held for this game; zeroed on every exit path.
        uint256 totalDeposits;
        /// @dev Current lifecycle status.
        Status status;
        /// @dev Block timestamp of `createGame`.
        uint64 createdAt;
        /// @dev Block timestamp of `joinGame`; zero until joined.
        uint64 activatedAt;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// @notice The USDC token this escrow holds.
    IERC20 public immutable usdcToken;

    /// @notice Account allowed to rotate the server address and transfer ownership.
    address public owner;

    /// @notice Account allowed to settle and cancel games.
    address public serverAddress;

    /// @notice How long after activation players must wait before `claimTimeout`.
    uint256 public constant SETTLEMENT_TIMEOUT = 7 days;

    /// @notice Escrow records keyed by `keccak256(abi.encodePacked(serverGameId))`.
    mapping(bytes32 => Game) public games;

    /// @dev Reentrancy lock: 1 = unlocked, 2 = locked.
    uint256 private _lock = 1;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    /// @notice Emitted when player 1 creates and funds a game.
    event GameCreated(bytes32 indexed gameId, string serverGameId, address indexed player1, uint256 stake);

    /// @notice Emitted when player 2 joins and funds a game.
    event PlayerJoined(bytes32 indexed gameId, address indexed player2);

    /// @notice Emitted when the server settles a game.
    event GameSettled(bytes32 indexed gameId, uint256 player1Amount, uint256 player2Amount);

    /// @notice Emitted when a game is cancelled (by the server, or by player 1 via `withdrawUnjoined`).
    event GameCancelled(bytes32 indexed gameId, uint256 refund1, uint256 refund2);

    /// @notice Emitted when a player claims the settlement timeout.
    event GameTimedOut(bytes32 indexed gameId, address indexed claimant);

    /// @notice Emitted when the server address changes (also once at construction).
    event ServerAddressUpdated(address indexed previous, address indexed current);

    /// @notice Emitted when ownership changes (also once at construction).
    event OwnershipTransferred(address indexed previous, address indexed current);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    /// @dev Restricts a function to the owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "GameEscrow: caller is not the owner");
        _;
    }

    /// @dev Restricts a function to the server.
    modifier onlyServer() {
        require(msg.sender == serverAddress, "GameEscrow: caller is not the server");
        _;
    }

    /// @dev Simple mutex against reentrancy through the token.
    modifier nonReentrant() {
        require(_lock == 1, "ReentrancyGuard: reentrant call");
        _lock = 2;
        _;
        _lock = 1;
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    /**
     * @param _usdcToken Address of the USDC token contract.
     * @param _serverAddress Account authorised to settle and cancel games.
     */
    constructor(address _usdcToken, address _serverAddress) {
        require(_usdcToken != address(0), "GameEscrow: invalid USDC address");
        require(_serverAddress != address(0), "GameEscrow: invalid server address");
        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;
        serverAddress = _serverAddress;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ServerAddressUpdated(address(0), _serverAddress);
    }

    // ------------------------------------------------------------------
    // Player writes
    // ------------------------------------------------------------------

    /**
     * @notice Create a game and escrow player 1's stake.
     * @dev Caller must have approved this contract for at least `stake`.
     * @param serverGameId The server-side game id; hashed to derive `gameId`.
     * @param stake Per-player stake in USDC base units. Must be non-zero.
     * @return gameId `keccak256(abi.encodePacked(serverGameId))`.
     */
    function createGame(string calldata serverGameId, uint256 stake) external nonReentrant returns (bytes32 gameId) {
        require(stake > 0, "GameEscrow: stake must be greater than zero");
        gameId = getGameIdFromServerId(serverGameId);
        Game storage game = games[gameId];
        require(game.status == Status.None, "GameEscrow: game already exists");

        game.player1 = msg.sender;
        game.stake = stake;
        game.totalDeposits = stake;
        game.status = Status.Created;
        game.createdAt = uint64(block.timestamp);

        require(usdcToken.transferFrom(msg.sender, address(this), stake), "GameEscrow: stake transfer failed");

        emit GameCreated(gameId, serverGameId, msg.sender, stake);
    }

    /**
     * @notice Join a created game as player 2 and escrow the matching stake.
     * @dev Status and self-join are checked before any transfer, so a caller
     *      who loses the race to join never pays.
     * @param gameId The on-chain game id.
     */
    function joinGame(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(game.status == Status.Created, "GameEscrow: game is not open to join");
        require(msg.sender != game.player1, "GameEscrow: cannot join your own game");

        uint256 stake = game.stake;
        game.player2 = msg.sender;
        game.totalDeposits += stake;
        game.status = Status.Active;
        game.activatedAt = uint64(block.timestamp);

        require(usdcToken.transferFrom(msg.sender, address(this), stake), "GameEscrow: stake transfer failed");

        emit PlayerJoined(gameId, msg.sender);
    }

    /**
     * @notice Player 1 withdraws their stake from a game nobody has joined.
     * @param gameId The on-chain game id.
     */
    function withdrawUnjoined(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(game.status == Status.Created, "GameEscrow: game is not awaiting a player");
        require(msg.sender == game.player1, "GameEscrow: caller is not player1");

        uint256 refund = game.totalDeposits;
        game.totalDeposits = 0;
        game.status = Status.Cancelled;

        require(usdcToken.transfer(game.player1, refund), "GameEscrow: refund transfer failed");

        emit GameCancelled(gameId, refund, 0);
    }

    /**
     * @notice Either player refunds both stakes if the server has not settled
     *         within `SETTLEMENT_TIMEOUT` of activation.
     * @param gameId The on-chain game id.
     */
    function claimTimeout(bytes32 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(game.status == Status.Active, "GameEscrow: game is not active");
        require(msg.sender == game.player1 || msg.sender == game.player2, "GameEscrow: caller is not a player");
        require(
            block.timestamp > uint256(game.activatedAt) + SETTLEMENT_TIMEOUT,
            "GameEscrow: settlement timeout not reached"
        );

        uint256 stake = game.stake;
        game.totalDeposits = 0;
        game.status = Status.TimedOut;

        require(usdcToken.transfer(game.player1, stake), "GameEscrow: refund transfer failed");
        require(usdcToken.transfer(game.player2, stake), "GameEscrow: refund transfer failed");

        emit GameTimedOut(gameId, msg.sender);
    }

    // ------------------------------------------------------------------
    // Server writes
    // ------------------------------------------------------------------

    /**
     * @notice Settle an active game, paying each player their share of the pot.
     * @dev `player1Amount + player2Amount` must equal the game's `totalDeposits`.
     *      Zero-amount transfers are skipped.
     * @param gameId The on-chain game id.
     * @param player1Amount Payout to player 1 in USDC base units.
     * @param player2Amount Payout to player 2 in USDC base units.
     */
    function settleGame(bytes32 gameId, uint256 player1Amount, uint256 player2Amount) external onlyServer nonReentrant {
        Game storage game = games[gameId];
        require(game.status == Status.Active, "GameEscrow: game is not active");
        require(player1Amount + player2Amount == game.totalDeposits, "GameEscrow: amounts do not match deposits");

        game.totalDeposits = 0;
        game.status = Status.Settled;

        if (player1Amount > 0) {
            require(usdcToken.transfer(game.player1, player1Amount), "GameEscrow: payout transfer failed");
        }
        if (player2Amount > 0) {
            require(usdcToken.transfer(game.player2, player2Amount), "GameEscrow: payout transfer failed");
        }

        emit GameSettled(gameId, player1Amount, player2Amount);
    }

    /**
     * @notice Cancel a created or active game and refund each present player their stake.
     * @param gameId The on-chain game id.
     */
    function cancelGame(bytes32 gameId) external onlyServer nonReentrant {
        Game storage game = games[gameId];
        require(game.status == Status.Created || game.status == Status.Active, "GameEscrow: game cannot be cancelled");

        uint256 stake = game.stake;
        address player2 = game.player2;
        uint256 refund1 = stake;
        uint256 refund2 = player2 != address(0) ? stake : 0;

        game.totalDeposits = 0;
        game.status = Status.Cancelled;

        require(usdcToken.transfer(game.player1, refund1), "GameEscrow: refund transfer failed");
        if (refund2 > 0) {
            require(usdcToken.transfer(player2, refund2), "GameEscrow: refund transfer failed");
        }

        emit GameCancelled(gameId, refund1, refund2);
    }

    // ------------------------------------------------------------------
    // Owner writes
    // ------------------------------------------------------------------

    /**
     * @notice Rotate the server account.
     * @param newServer The new server address. Must be non-zero.
     */
    function setServerAddress(address newServer) external onlyOwner nonReentrant {
        require(newServer != address(0), "GameEscrow: invalid server address");
        address previous = serverAddress;
        serverAddress = newServer;
        emit ServerAddressUpdated(previous, newServer);
    }

    /**
     * @notice Transfer contract ownership.
     * @param newOwner The new owner. Must be non-zero.
     */
    function transferOwnership(address newOwner) external onlyOwner nonReentrant {
        require(newOwner != address(0), "GameEscrow: invalid owner address");
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    /**
     * @notice Read a game record. Returns an all-zero struct for unknown ids.
     * @param gameId The on-chain game id.
     * @return The game record.
     */
    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    /**
     * @notice Derive the on-chain game id from the server-side id.
     * @param serverGameId The server-side game id.
     * @return `keccak256(abi.encodePacked(serverGameId))`.
     */
    function getGameIdFromServerId(string calldata serverGameId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(serverGameId));
    }
}
