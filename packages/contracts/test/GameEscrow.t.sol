// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/GameEscrow.sol";
import "../src/interfaces/IERC20.sol";

// Mock ERC20 token for testing
contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    uint256 public totalSupply;
    uint8 public constant decimals = 6;
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }
}

contract GameEscrowTest is Test {
    GameEscrow public escrow;
    MockUSDC public usdc;
    address public server = address(0x1234);
    address public player1 = address(0x1111);
    address public player2 = address(0x2222);
    
    uint256 public constant STAKE = 100 * 10**6; // 100 USDC with 6 decimals
    
    function setUp() public {
        usdc = new MockUSDC();
        escrow = new GameEscrow(address(usdc), server);
        
        // Mint USDC to players
        usdc.mint(player1, 1000 * 10**6);
        usdc.mint(player2, 1000 * 10**6);
        
        // Approve escrow contract
        vm.prank(player1);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(player2);
        usdc.approve(address(escrow), type(uint256).max);
    }
    
    function testCreateGame() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        assertEq(escrow.getGameIdFromServerId("game_123"), gameId);
        assertEq(usdc.balanceOf(address(escrow)), STAKE);
        
        GameEscrow.Game memory game = escrow.getGame(gameId);
        assertEq(game.player1, player1);
        assertEq(game.player2, address(0));
        assertEq(game.stake, STAKE);
        assertEq(game.player1Deposits, STAKE);
        assertEq(game.player2Deposits, 0);
        assertEq(game.isActive, false);
    }
    
    function testJoinGame() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        assertEq(usdc.balanceOf(address(escrow)), STAKE * 2);
        
        GameEscrow.Game memory game = escrow.getGame(gameId);
        assertEq(game.player2, player2);
        assertEq(game.player2Deposits, STAKE);
        assertEq(game.isActive, true);
    }
    
    function testDepositBet() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        uint256 betAmount = 50 * 10**6;
        vm.prank(player1);
        escrow.depositBet(gameId, betAmount);
        
        GameEscrow.Game memory game = escrow.getGame(gameId);
        assertEq(game.player1Deposits, STAKE + betAmount);
        assertEq(usdc.balanceOf(address(escrow)), STAKE * 2 + betAmount);
    }
    
    function testPayoutWinner() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        uint256 betAmount = 50 * 10**6;
        vm.prank(player1);
        escrow.depositBet(gameId, betAmount);
        
        uint256 totalPayout = STAKE * 2 + betAmount;
        uint256 player1BalanceBefore = usdc.balanceOf(player1);
        
        vm.prank(server);
        escrow.payoutWinner(gameId, player1, totalPayout);
        
        assertEq(usdc.balanceOf(player1), player1BalanceBefore + totalPayout);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        
        GameEscrow.Game memory game = escrow.getGame(gameId);
        assertEq(game.isActive, false);
    }
    
    function testCancelGame() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        uint256 player1BalanceBefore = usdc.balanceOf(player1);
        
        vm.prank(server);
        escrow.cancelGame(gameId);
        
        assertEq(usdc.balanceOf(player1), player1BalanceBefore + STAKE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        
        GameEscrow.Game memory game = escrow.getGame(gameId);
        assertEq(game.isCancelled, true);
        assertEq(game.isActive, false);
    }
    
    function testCancelGameWithTwoPlayers() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        uint256 player1BalanceBefore = usdc.balanceOf(player1);
        uint256 player2BalanceBefore = usdc.balanceOf(player2);
        
        vm.prank(server);
        escrow.cancelGame(gameId);
        
        assertEq(usdc.balanceOf(player1), player1BalanceBefore + STAKE);
        assertEq(usdc.balanceOf(player2), player2BalanceBefore + STAKE);
    }
    
    function testGetGameBalance() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        uint256 betAmount = 50 * 10**6;
        vm.prank(player1);
        escrow.depositBet(gameId, betAmount);
        
        assertEq(escrow.getGameBalance(gameId), STAKE * 2 + betAmount);
    }
    
    function testRevertWhenNotPlayer() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        vm.prank(address(0x9999));
        vm.expectRevert("Only players can deposit bets");
        escrow.depositBet(gameId, 10 * 10**6);
    }
    
    function testRevertWhenNotServer() public {
        vm.prank(player1);
        bytes32 gameId = escrow.createGame("game_123", STAKE);
        
        vm.prank(player2);
        escrow.joinGame(gameId);
        
        vm.prank(player1);
        vm.expectRevert("Only server can call this");
        escrow.payoutWinner(gameId, player1, STAKE * 2);
    }
}
