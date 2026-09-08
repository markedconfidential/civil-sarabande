// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/GameEscrow.sol";
import "../src/mocks/MockUSDC.sol";

/// @dev Token that reenters the escrow from inside `transfer`, to prove the guard holds.
contract ReentrantUSDC is MockUSDC {
    GameEscrow public escrow;
    bytes32 public targetGameId;
    bool public armed;

    function arm(GameEscrow _escrow, bytes32 _gameId) external {
        escrow = _escrow;
        targetGameId = _gameId;
        armed = true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (armed) {
            armed = false;
            // Attempt to withdraw again while the first withdrawal is mid-flight.
            escrow.withdrawUnjoined(targetGameId);
        }
        _transfer(msg.sender, to, amount);
        return true;
    }
}

contract GameEscrowTest is Test {
    // Re-declared so vm.expectEmit can reference them.
    event GameCreated(bytes32 indexed gameId, string serverGameId, address indexed player1, uint256 stake);
    event PlayerJoined(bytes32 indexed gameId, address indexed player2);
    event GameSettled(bytes32 indexed gameId, uint256 player1Amount, uint256 player2Amount);
    event GameCancelled(bytes32 indexed gameId, uint256 refund1, uint256 refund2);
    event GameTimedOut(bytes32 indexed gameId, address indexed claimant);
    event ServerAddressUpdated(address indexed previous, address indexed current);
    event OwnershipTransferred(address indexed previous, address indexed current);

    GameEscrow internal escrow;
    MockUSDC internal usdc;

    address internal deployer = address(this);
    address internal server = makeAddr("server");
    address internal player1 = makeAddr("player1");
    address internal player2 = makeAddr("player2");
    address internal player3 = makeAddr("player3");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant STAKE = 100e6; // 100 USDC
    uint256 internal constant TOTAL = 2 * STAKE;
    uint256 internal constant INITIAL_BALANCE = 1_000e6;
    string internal constant SERVER_ID = "game_123";
    bytes32 internal GAME_ID;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new GameEscrow(address(usdc), server);
        GAME_ID = keccak256(abi.encodePacked(SERVER_ID));

        address[3] memory players = [player1, player2, player3];
        for (uint256 i = 0; i < players.length; i++) {
            usdc.mint(players[i], INITIAL_BALANCE);
            vm.prank(players[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _create(string memory serverId) internal returns (bytes32) {
        vm.prank(player1);
        return escrow.createGame(serverId, STAKE);
    }

    function _createAndJoin(string memory serverId) internal returns (bytes32 gameId) {
        gameId = _create(serverId);
        vm.prank(player2);
        escrow.joinGame(gameId);
    }

    function _assertClosed(bytes32 gameId, GameEscrow.Status expected) internal view {
        GameEscrow.Game memory g = escrow.getGame(gameId);
        assertEq(uint8(g.status), uint8(expected), "status");
        assertEq(g.totalDeposits, 0, "totalDeposits must be zeroed on exit");
    }

    // ------------------------------------------------------------------
    // Constructor / configuration
    // ------------------------------------------------------------------

    function test_Constructor_State() public {
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(address(0), deployer);
        vm.expectEmit(true, true, false, false);
        emit ServerAddressUpdated(address(0), server);
        GameEscrow fresh = new GameEscrow(address(usdc), server);

        assertEq(address(fresh.usdcToken()), address(usdc));
        assertEq(fresh.owner(), deployer);
        assertEq(fresh.serverAddress(), server);
        assertEq(fresh.SETTLEMENT_TIMEOUT(), 7 days);
    }

    function test_Constructor_RevertZeroAddresses() public {
        vm.expectRevert("GameEscrow: invalid USDC address");
        new GameEscrow(address(0), server);
        vm.expectRevert("GameEscrow: invalid server address");
        new GameEscrow(address(usdc), address(0));
    }

    function test_GetGameIdFromServerId_MatchesKeccak() public view {
        assertEq(escrow.getGameIdFromServerId(SERVER_ID), GAME_ID);
        assertEq(escrow.getGameIdFromServerId(""), keccak256(""));
    }

    function test_GetGame_UnknownIsAllZero() public view {
        GameEscrow.Game memory g = escrow.getGame(keccak256("nope"));
        assertEq(g.player1, address(0));
        assertEq(g.player2, address(0));
        assertEq(g.stake, 0);
        assertEq(g.totalDeposits, 0);
        assertEq(uint8(g.status), uint8(GameEscrow.Status.None));
        assertEq(g.createdAt, 0);
        assertEq(g.activatedAt, 0);
    }

    // ------------------------------------------------------------------
    // createGame
    // ------------------------------------------------------------------

    function test_CreateGame_Happy() public {
        vm.warp(1_700_000_000);
        vm.expectEmit(true, true, false, true);
        emit GameCreated(GAME_ID, SERVER_ID, player1, STAKE);

        vm.prank(player1);
        bytes32 gameId = escrow.createGame(SERVER_ID, STAKE);

        assertEq(gameId, GAME_ID);
        assertEq(usdc.balanceOf(address(escrow)), STAKE);
        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE - STAKE);

        GameEscrow.Game memory g = escrow.getGame(gameId);
        assertEq(g.player1, player1);
        assertEq(g.player2, address(0));
        assertEq(g.stake, STAKE);
        assertEq(g.totalDeposits, STAKE);
        assertEq(uint8(g.status), uint8(GameEscrow.Status.Created));
        assertEq(g.createdAt, 1_700_000_000);
        assertEq(g.activatedAt, 0);

        // The public mapping getter agrees with getGame.
        (address p1,, uint256 stake, uint256 deposits, GameEscrow.Status status,,) = escrow.games(gameId);
        assertEq(p1, player1);
        assertEq(stake, STAKE);
        assertEq(deposits, STAKE);
        assertEq(uint8(status), uint8(GameEscrow.Status.Created));
    }

    function test_CreateGame_RevertZeroStake() public {
        vm.prank(player1);
        vm.expectRevert("GameEscrow: stake must be greater than zero");
        escrow.createGame(SERVER_ID, 0);
    }

    function test_CreateGame_RevertDuplicateId() public {
        _create(SERVER_ID);
        vm.prank(player2);
        vm.expectRevert("GameEscrow: game already exists");
        escrow.createGame(SERVER_ID, STAKE);
        // Still one stake held.
        assertEq(usdc.balanceOf(address(escrow)), STAKE);
    }

    function test_CreateGame_RevertDuplicateIdAfterClose() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(player1);
        escrow.withdrawUnjoined(gameId);
        // Ids are single-use even after the game is closed.
        vm.prank(player1);
        vm.expectRevert("GameEscrow: game already exists");
        escrow.createGame(SERVER_ID, STAKE);
    }

    function test_CreateGame_RevertInsufficientAllowance() public {
        vm.startPrank(player1);
        usdc.approve(address(escrow), STAKE - 1);
        vm.expectRevert("MockUSDC: insufficient allowance");
        escrow.createGame(SERVER_ID, STAKE);
        vm.stopPrank();
        assertEq(uint8(escrow.getGame(GAME_ID).status), uint8(GameEscrow.Status.None));
    }

    function test_CreateGame_RevertInsufficientBalance() public {
        vm.prank(player1);
        vm.expectRevert("MockUSDC: insufficient balance");
        escrow.createGame(SERVER_ID, INITIAL_BALANCE + 1);
    }

    // ------------------------------------------------------------------
    // joinGame
    // ------------------------------------------------------------------

    function test_JoinGame_Happy() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.warp(block.timestamp + 60);

        vm.expectEmit(true, true, false, false);
        emit PlayerJoined(gameId, player2);
        vm.prank(player2);
        escrow.joinGame(gameId);

        assertEq(usdc.balanceOf(address(escrow)), TOTAL);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE - STAKE);

        GameEscrow.Game memory g = escrow.getGame(gameId);
        assertEq(g.player2, player2);
        assertEq(g.totalDeposits, TOTAL);
        assertEq(uint8(g.status), uint8(GameEscrow.Status.Active));
        assertEq(g.activatedAt, block.timestamp);
    }

    function test_JoinGame_RevertSelfJoin() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: cannot join your own game");
        escrow.joinGame(gameId);
        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE - STAKE);
    }

    function test_JoinGame_RevertUnknownGame() public {
        vm.prank(player2);
        vm.expectRevert("GameEscrow: game is not open to join");
        escrow.joinGame(keccak256("unknown"));
    }

    function test_JoinGame_RevertWrongStatus() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(player1);
        escrow.withdrawUnjoined(gameId);
        vm.prank(player2);
        vm.expectRevert("GameEscrow: game is not open to join");
        escrow.joinGame(gameId);
    }

    function test_JoinGame_SecondJoinerRevertsBeforeTransfer() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        uint256 before = usdc.balanceOf(player3);

        vm.prank(player3);
        vm.expectRevert("GameEscrow: game is not open to join");
        escrow.joinGame(gameId);

        assertEq(usdc.balanceOf(player3), before, "loser of the join race must not pay");
        assertEq(escrow.getGame(gameId).player2, player2);
        assertEq(usdc.balanceOf(address(escrow)), TOTAL);
    }

    function test_JoinGame_StatusCheckedBeforeAllowance() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        // stranger has no allowance and no balance; the status check must fire first.
        vm.prank(stranger);
        vm.expectRevert("GameEscrow: game is not open to join");
        escrow.joinGame(gameId);
    }

    function test_JoinGame_RevertInsufficientAllowance() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.startPrank(player2);
        usdc.approve(address(escrow), 0);
        vm.expectRevert("MockUSDC: insufficient allowance");
        escrow.joinGame(gameId);
        vm.stopPrank();
        // Nothing persisted from the failed join.
        GameEscrow.Game memory g = escrow.getGame(gameId);
        assertEq(g.player2, address(0));
        assertEq(uint8(g.status), uint8(GameEscrow.Status.Created));
        assertEq(g.totalDeposits, STAKE);
    }

    // ------------------------------------------------------------------
    // settleGame
    // ------------------------------------------------------------------

    function test_SettleGame_WinnerTakeAll() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameSettled(gameId, TOTAL, 0);
        vm.prank(server);
        escrow.settleGame(gameId, TOTAL, 0);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE + STAKE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE - STAKE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    function test_SettleGame_WinnerTakeAllPlayer2() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameSettled(gameId, 0, TOTAL);
        vm.prank(server);
        escrow.settleGame(gameId, 0, TOTAL);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE - STAKE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE + STAKE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    function test_SettleGame_Split() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        uint256 p1 = 130e6;
        uint256 p2 = TOTAL - p1;

        vm.expectEmit(true, false, false, true);
        emit GameSettled(gameId, p1, p2);
        vm.prank(server);
        escrow.settleGame(gameId, p1, p2);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE - STAKE + p1);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE - STAKE + p2);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    function test_SettleGame_Tie() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameSettled(gameId, STAKE, STAKE);
        vm.prank(server);
        escrow.settleGame(gameId, STAKE, STAKE);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    function test_SettleGame_RevertSumTooHigh() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.prank(server);
        vm.expectRevert("GameEscrow: amounts do not match deposits");
        escrow.settleGame(gameId, TOTAL, 1);
    }

    function test_SettleGame_RevertSumTooLow() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.prank(server);
        vm.expectRevert("GameEscrow: amounts do not match deposits");
        escrow.settleGame(gameId, STAKE, STAKE - 1);
    }

    function test_SettleGame_RevertSumOverflow() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        // Overflowing addition must revert, not wrap around to TOTAL.
        vm.prank(server);
        vm.expectRevert(stdError.arithmeticError);
        escrow.settleGame(gameId, type(uint256).max, TOTAL + 1);
    }

    function test_SettleGame_RevertNotServer() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: caller is not the server");
        escrow.settleGame(gameId, TOTAL, 0);
        vm.prank(deployer); // owner is not the server either
        vm.expectRevert("GameEscrow: caller is not the server");
        escrow.settleGame(gameId, TOTAL, 0);
    }

    function test_SettleGame_RevertNotActive() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(server);
        vm.expectRevert("GameEscrow: game is not active");
        escrow.settleGame(gameId, STAKE, 0);
    }

    function test_SettleGame_RevertDoubleSettle() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.startPrank(server);
        escrow.settleGame(gameId, TOTAL, 0);
        vm.expectRevert("GameEscrow: game is not active");
        escrow.settleGame(gameId, 0, 0);
        vm.stopPrank();
    }

    function testFuzz_SettleSplit(uint256 a) public {
        a = bound(a, 0, TOTAL);
        uint256 b = TOTAL - a;

        bytes32 gameId = _createAndJoin(SERVER_ID);
        bytes32 otherId = _createAndJoin("other_game");
        assertEq(usdc.balanceOf(address(escrow)), 2 * TOTAL);

        uint256 p1Before = usdc.balanceOf(player1);
        uint256 p2Before = usdc.balanceOf(player2);

        vm.expectEmit(true, false, false, true);
        emit GameSettled(gameId, a, b);
        vm.prank(server);
        escrow.settleGame(gameId, a, b);

        assertEq(usdc.balanceOf(player1), p1Before + a);
        assertEq(usdc.balanceOf(player2), p2Before + b);
        assertEq(usdc.balanceOf(address(escrow)), TOTAL, "escrow holds exactly the other game's funds");
        _assertClosed(gameId, GameEscrow.Status.Settled);
        assertEq(escrow.getGame(otherId).totalDeposits, TOTAL);
        assertEq(uint8(escrow.getGame(otherId).status), uint8(GameEscrow.Status.Active));
    }

    function testFuzz_CreateJoinCancel_RefundsExactly(uint256 stake) public {
        stake = bound(stake, 1, INITIAL_BALANCE);
        vm.prank(player1);
        bytes32 gameId = escrow.createGame(SERVER_ID, stake);
        vm.prank(player2);
        escrow.joinGame(gameId);
        assertEq(usdc.balanceOf(address(escrow)), 2 * stake);

        vm.prank(server);
        escrow.cancelGame(gameId);
        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ------------------------------------------------------------------
    // cancelGame
    // ------------------------------------------------------------------

    function test_CancelGame_Created() public {
        bytes32 gameId = _create(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameCancelled(gameId, STAKE, 0);
        vm.prank(server);
        escrow.cancelGame(gameId);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Cancelled);
    }

    function test_CancelGame_Active() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameCancelled(gameId, STAKE, STAKE);
        vm.prank(server);
        escrow.cancelGame(gameId);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Cancelled);
    }

    function test_CancelGame_RevertAfterSettle() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.startPrank(server);
        escrow.settleGame(gameId, TOTAL, 0);
        vm.expectRevert("GameEscrow: game cannot be cancelled");
        escrow.cancelGame(gameId);
        vm.stopPrank();
    }

    function test_CancelGame_RevertDoubleCancel() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.startPrank(server);
        escrow.cancelGame(gameId);
        vm.expectRevert("GameEscrow: game cannot be cancelled");
        escrow.cancelGame(gameId);
        vm.stopPrank();
    }

    function test_CancelGame_RevertNotServer() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: caller is not the server");
        escrow.cancelGame(gameId);
    }

    function test_CancelGame_RevertUnknownGame() public {
        vm.prank(server);
        vm.expectRevert("GameEscrow: game cannot be cancelled");
        escrow.cancelGame(keccak256("unknown"));
    }

    function test_CrossGameIsolation_CancelAfterOtherSettled() public {
        bytes32 gameA = _createAndJoin("game_A");
        vm.prank(player3);
        bytes32 gameB = escrow.createGame("game_B", 40e6);
        vm.prank(player2);
        escrow.joinGame(gameB);
        assertEq(usdc.balanceOf(address(escrow)), TOTAL + 80e6);

        vm.prank(server);
        escrow.settleGame(gameA, TOTAL, 0);
        assertEq(usdc.balanceOf(address(escrow)), 80e6, "only game B's funds remain");

        uint256 p3Before = usdc.balanceOf(player3);
        uint256 p2Before = usdc.balanceOf(player2);
        vm.expectEmit(true, false, false, true);
        emit GameCancelled(gameB, 40e6, 40e6);
        vm.prank(server);
        escrow.cancelGame(gameB);

        assertEq(usdc.balanceOf(player3), p3Before + 40e6);
        assertEq(usdc.balanceOf(player2), p2Before + 40e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameA, GameEscrow.Status.Settled);
        _assertClosed(gameB, GameEscrow.Status.Cancelled);
    }

    // ------------------------------------------------------------------
    // withdrawUnjoined
    // ------------------------------------------------------------------

    function test_WithdrawUnjoined_Happy() public {
        bytes32 gameId = _create(SERVER_ID);

        vm.expectEmit(true, false, false, true);
        emit GameCancelled(gameId, STAKE, 0);
        vm.prank(player1);
        escrow.withdrawUnjoined(gameId);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.Cancelled);
    }

    function test_WithdrawUnjoined_RevertAfterJoin() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: game is not awaiting a player");
        escrow.withdrawUnjoined(gameId);
        assertEq(usdc.balanceOf(address(escrow)), TOTAL);
    }

    function test_WithdrawUnjoined_RevertNotPlayer1() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.prank(player2);
        vm.expectRevert("GameEscrow: caller is not player1");
        escrow.withdrawUnjoined(gameId);
        vm.prank(server);
        vm.expectRevert("GameEscrow: caller is not player1");
        escrow.withdrawUnjoined(gameId);
    }

    function test_WithdrawUnjoined_RevertDouble() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.startPrank(player1);
        escrow.withdrawUnjoined(gameId);
        vm.expectRevert("GameEscrow: game is not awaiting a player");
        escrow.withdrawUnjoined(gameId);
        vm.stopPrank();
    }

    function test_WithdrawUnjoined_ReentrancyBlocked() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        GameEscrow victim = new GameEscrow(address(evil), server);
        evil.mint(player1, STAKE);
        vm.startPrank(player1);
        evil.approve(address(victim), STAKE);
        bytes32 gameId = victim.createGame(SERVER_ID, STAKE);
        evil.arm(victim, gameId);
        vm.expectRevert("ReentrancyGuard: reentrant call");
        victim.withdrawUnjoined(gameId);
        vm.stopPrank();
        // Nothing moved.
        assertEq(evil.balanceOf(address(victim)), STAKE);
        assertEq(uint8(victim.getGame(gameId).status), uint8(GameEscrow.Status.Created));
    }

    // ------------------------------------------------------------------
    // claimTimeout
    // ------------------------------------------------------------------

    function test_ClaimTimeout_RevertBeforeDeadline() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        uint64 activatedAt = escrow.getGame(gameId).activatedAt;

        vm.prank(player1);
        vm.expectRevert("GameEscrow: settlement timeout not reached");
        escrow.claimTimeout(gameId);

        // Exactly at the deadline is still too early (strict inequality).
        vm.warp(activatedAt + 7 days);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: settlement timeout not reached");
        escrow.claimTimeout(gameId);
    }

    function test_ClaimTimeout_Player1AfterDeadline() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.warp(escrow.getGame(gameId).activatedAt + 7 days + 1);

        vm.expectEmit(true, true, false, false);
        emit GameTimedOut(gameId, player1);
        vm.prank(player1);
        escrow.claimTimeout(gameId);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.TimedOut);
    }

    function test_ClaimTimeout_Player2AfterDeadline() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.warp(escrow.getGame(gameId).activatedAt + 7 days + 1);

        vm.expectEmit(true, true, false, false);
        emit GameTimedOut(gameId, player2);
        vm.prank(player2);
        escrow.claimTimeout(gameId);

        assertEq(usdc.balanceOf(player1), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(player2), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        _assertClosed(gameId, GameEscrow.Status.TimedOut);
    }

    function test_ClaimTimeout_RevertSecondClaim() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.warp(escrow.getGame(gameId).activatedAt + 7 days + 1);
        vm.prank(player1);
        escrow.claimTimeout(gameId);
        vm.prank(player2);
        vm.expectRevert("GameEscrow: game is not active");
        escrow.claimTimeout(gameId);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ClaimTimeout_RevertNonPlayer() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.warp(escrow.getGame(gameId).activatedAt + 7 days + 1);
        vm.prank(stranger);
        vm.expectRevert("GameEscrow: caller is not a player");
        escrow.claimTimeout(gameId);
        vm.prank(server);
        vm.expectRevert("GameEscrow: caller is not a player");
        escrow.claimTimeout(gameId);
    }

    function test_ClaimTimeout_RevertAfterSettle() public {
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.prank(server);
        escrow.settleGame(gameId, TOTAL, 0);
        vm.warp(block.timestamp + 8 days);
        vm.prank(player2);
        vm.expectRevert("GameEscrow: game is not active");
        escrow.claimTimeout(gameId);
    }

    function test_ClaimTimeout_RevertNotJoined() public {
        bytes32 gameId = _create(SERVER_ID);
        vm.warp(block.timestamp + 8 days);
        vm.prank(player1);
        vm.expectRevert("GameEscrow: game is not active");
        escrow.claimTimeout(gameId);
    }

    function test_ClaimTimeout_ServerCanStillSettleAfterDeadline() public {
        // The timeout is an escape hatch, not a hard stop for the server.
        bytes32 gameId = _createAndJoin(SERVER_ID);
        vm.warp(escrow.getGame(gameId).activatedAt + 30 days);
        vm.prank(server);
        escrow.settleGame(gameId, 0, TOTAL);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    // ------------------------------------------------------------------
    // Ownership and server rotation
    // ------------------------------------------------------------------

    function test_SetServerAddress_Happy() public {
        address newServer = makeAddr("newServer");
        bytes32 gameId = _createAndJoin(SERVER_ID);

        vm.expectEmit(true, true, false, false);
        emit ServerAddressUpdated(server, newServer);
        vm.prank(deployer);
        escrow.setServerAddress(newServer);
        assertEq(escrow.serverAddress(), newServer);

        // Old server is locked out; new server can settle.
        vm.prank(server);
        vm.expectRevert("GameEscrow: caller is not the server");
        escrow.settleGame(gameId, TOTAL, 0);
        vm.prank(newServer);
        escrow.settleGame(gameId, TOTAL, 0);
        _assertClosed(gameId, GameEscrow.Status.Settled);
    }

    function test_SetServerAddress_RevertNotOwner() public {
        vm.prank(server);
        vm.expectRevert("GameEscrow: caller is not the owner");
        escrow.setServerAddress(stranger);
        vm.prank(stranger);
        vm.expectRevert("GameEscrow: caller is not the owner");
        escrow.setServerAddress(stranger);
        assertEq(escrow.serverAddress(), server);
    }

    function test_SetServerAddress_RevertZero() public {
        vm.prank(deployer);
        vm.expectRevert("GameEscrow: invalid server address");
        escrow.setServerAddress(address(0));
    }

    function test_TransferOwnership_Happy() public {
        address newOwner = makeAddr("newOwner");

        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(deployer, newOwner);
        vm.prank(deployer);
        escrow.transferOwnership(newOwner);
        assertEq(escrow.owner(), newOwner);

        // Old owner is locked out; new owner can rotate the server.
        vm.prank(deployer);
        vm.expectRevert("GameEscrow: caller is not the owner");
        escrow.setServerAddress(stranger);
        vm.prank(newOwner);
        escrow.setServerAddress(stranger);
        assertEq(escrow.serverAddress(), stranger);
    }

    function test_TransferOwnership_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert("GameEscrow: caller is not the owner");
        escrow.transferOwnership(stranger);
        assertEq(escrow.owner(), deployer);
    }

    function test_TransferOwnership_RevertZero() public {
        vm.prank(deployer);
        vm.expectRevert("GameEscrow: invalid owner address");
        escrow.transferOwnership(address(0));
    }
}
