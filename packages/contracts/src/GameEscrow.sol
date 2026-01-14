// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./interfaces/IERC20.sol";

/**
 * @title GameEscrow
 * @dev Escrow contract for Civil Sarabande game funds
 * Handles USDC deposits for game stakes, bets, and winner payouts
 */
contract GameEscrow {
    IERC20 public immutable usdcToken;
    address public immutable serverAddress;
    
    // Reentrancy guard
    bool private locked;
    
    // Game state structure
    struct Game {
        address player1;
        address player2;
        uint256 stake;
        uint256 player1Deposits;
        uint256 player2Deposits;
        bool isActive;
        bool isCancelled;
    }
    
    // Mapping from gameId (bytes32 hash of server game ID) to Game
    mapping(bytes32 => Game) public games;
    
    // Mapping from server game ID string to bytes32 gameId
    mapping(string => bytes32) public serverGameIdToGameId;
    
    // Events
    event GameCreated(
        bytes32 indexed gameId,
        string indexed serverGameId,
        address indexed player1,
        uint256 stake
    );
    
    event PlayerJoined(
        bytes32 indexed gameId,
        address indexed player2,
        uint256 stake
    );
    
    event BetDeposited(
        bytes32 indexed gameId,
        address indexed player,
        uint256 amount
    );
    
    event WinnerPaid(
        bytes32 indexed gameId,
        address indexed winner,
        uint256 amount
    );
    
    event GameCancelled(
        bytes32 indexed gameId,
        address indexed player1,
        address indexed player2,
        uint256 refund1,
        uint256 refund2
    );
    
    // Modifiers
    modifier onlyServer() {
        require(msg.sender == serverAddress, "Only server can call this");
        _;
    }
    
    modifier gameExists(bytes32 gameId) {
        require(games[gameId].player1 != address(0), "Game does not exist");
        _;
    }
    
    modifier gameActive(bytes32 gameId) {
        require(games[gameId].isActive, "Game is not active");
        require(!games[gameId].isCancelled, "Game is cancelled");
        _;
    }
    
    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }
    
    /**
     * @dev Constructor
     * @param _usdcToken Address of USDC token contract
     * @param _serverAddress Address authorized to call payout/cancel functions
     */
    constructor(address _usdcToken, address _serverAddress) {
        require(_usdcToken != address(0), "Invalid USDC address");
        require(_serverAddress != address(0), "Invalid server address");
        usdcToken = IERC20(_usdcToken);
        serverAddress = _serverAddress;
    }
    
    /**
     * @dev Create a new game and escrow initial stake from player 1
     * @param serverGameId Server-side game ID (string)
     * @param stake Initial stake amount (in USDC, with 6 decimals)
     * @return gameId The on-chain game ID (bytes32)
     */
    function createGame(
        string memory serverGameId,
        uint256 stake
    ) external returns (bytes32) {
        require(msg.sender != address(0), "Invalid player address");
        require(stake > 0, "Stake must be greater than 0");
        
        // Generate gameId from server game ID
        bytes32 gameId = keccak256(abi.encodePacked(serverGameId));
        
        // Check if game already exists
        require(games[gameId].player1 == address(0), "Game already exists");
        
        // Store mapping
        serverGameIdToGameId[serverGameId] = gameId;
        
        // Transfer stake from player 1
        require(
            usdcToken.transferFrom(msg.sender, address(this), stake),
            "Failed to transfer stake from player1"
        );
        
        // Create game state (player2 will be set when they join)
        games[gameId] = Game({
            player1: msg.sender,
            player2: address(0),
            stake: stake,
            player1Deposits: stake,
            player2Deposits: 0,
            isActive: false, // Not active until player2 joins
            isCancelled: false
        });
        
        emit GameCreated(gameId, serverGameId, msg.sender, stake);
        
        return gameId;
    }
    
    /**
     * @dev Join an existing game and deposit stake from player 2
     * @param gameId The on-chain game ID
     */
    function joinGame(bytes32 gameId) external gameExists(gameId) {
        Game storage game = games[gameId];
        require(game.player2 == address(0), "Game already has two players");
        require(msg.sender != game.player1, "Cannot join as player1");
        require(!game.isCancelled, "Game is cancelled");
        
        // Transfer stake from player 2
        require(
            usdcToken.transferFrom(msg.sender, address(this), game.stake),
            "Failed to transfer stake from player2"
        );
        
        // Update game state
        game.player2 = msg.sender;
        game.player2Deposits = game.stake;
        game.isActive = true;
        
        emit PlayerJoined(gameId, msg.sender, game.stake);
    }
    
    /**
     * @dev Deposit additional bet amount during game
     * @param gameId The on-chain game ID
     * @param amount Amount to deposit (in USDC, with 6 decimals)
     */
    function depositBet(bytes32 gameId, uint256 amount) external nonReentrant gameExists(gameId) gameActive(gameId) {
        Game storage game = games[gameId];
        require(
            msg.sender == game.player1 || msg.sender == game.player2,
            "Only players can deposit bets"
        );
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer USDC from player
        require(
            usdcToken.transferFrom(msg.sender, address(this), amount),
            "Failed to transfer bet"
        );
        
        // Update deposits
        if (msg.sender == game.player1) {
            game.player1Deposits += amount;
        } else {
            game.player2Deposits += amount;
        }
        
        emit BetDeposited(gameId, msg.sender, amount);
    }
    
    /**
     * @dev Payout winner (only callable by server)
     * @param gameId The on-chain game ID
     * @param winner Address of the winner
     * @param amount Total amount to payout (in USDC, with 6 decimals)
     */
    function payoutWinner(
        bytes32 gameId,
        address winner,
        uint256 amount
    ) external onlyServer nonReentrant gameExists(gameId) gameActive(gameId) {
        Game storage game = games[gameId];
        require(
            winner == game.player1 || winner == game.player2,
            "Winner must be a player"
        );
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 totalDeposits = game.player1Deposits + game.player2Deposits;
        require(amount <= totalDeposits, "Amount exceeds total deposits");
        
        // Mark game as inactive
        game.isActive = false;
        
        // Transfer to winner
        require(
            usdcToken.transfer(winner, amount),
            "Failed to transfer to winner"
        );
        
        emit WinnerPaid(gameId, winner, amount);
    }
    
    /**
     * @dev Cancel game and refund both players (only callable by server)
     * @param gameId The on-chain game ID
     */
    function cancelGame(bytes32 gameId) external onlyServer nonReentrant gameExists(gameId) {
        Game storage game = games[gameId];
        require(!game.isCancelled, "Game already cancelled");
        
        // Mark as cancelled
        game.isCancelled = true;
        game.isActive = false;
        
        // Refund both players
        uint256 refund1 = game.player1Deposits;
        uint256 refund2 = game.player2Deposits;
        
        if (refund1 > 0) {
            require(
                usdcToken.transfer(game.player1, refund1),
                "Failed to refund player1"
            );
        }
        
        if (refund2 > 0) {
            require(
                usdcToken.transfer(game.player2, refund2),
                "Failed to refund player2"
            );
        }
        
        emit GameCancelled(gameId, game.player1, game.player2, refund1, refund2);
    }
    
    /**
     * @dev Get total balance escrowed for a game
     * @param gameId The on-chain game ID
     * @return Total amount escrowed
     */
    function getGameBalance(bytes32 gameId) external view gameExists(gameId) returns (uint256) {
        Game memory game = games[gameId];
        return game.player1Deposits + game.player2Deposits;
    }
    
    /**
     * @dev Get game details
     * @param gameId The on-chain game ID
     * @return Game struct
     */
    function getGame(bytes32 gameId) external view gameExists(gameId) returns (Game memory) {
        return games[gameId];
    }
    
    /**
     * @dev Get gameId from server game ID string
     * @param serverGameId Server-side game ID
     * @return gameId The on-chain game ID
     */
    function getGameIdFromServerId(string memory serverGameId) external view returns (bytes32) {
        return serverGameIdToGameId[serverGameId];
    }
}
