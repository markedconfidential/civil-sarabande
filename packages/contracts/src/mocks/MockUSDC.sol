// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../interfaces/IERC20.sol";

/**
 * @title MockUSDC
 * @notice Minimal 6-decimal ERC-20 used by the Foundry tests and the local Anvil
 *         deployment. Anyone can mint; never deploy this to a public network.
 */
contract MockUSDC is IERC20 {
    /// @notice Token name.
    string public constant name = "Mock USDC";
    /// @notice Token symbol.
    string public constant symbol = "USDC";
    /// @notice Same precision as real USDC.
    uint8 public constant decimals = 6;

    /// @inheritdoc IERC20
    uint256 public override totalSupply;
    /// @inheritdoc IERC20
    mapping(address => uint256) public override balanceOf;
    /// @inheritdoc IERC20
    mapping(address => mapping(address => uint256)) public override allowance;

    /**
     * @notice Mint `amount` base units to `to`. Unrestricted on purpose (test token).
     * @param to Recipient.
     * @param amount Amount in base units (6 decimals).
     */
    function mint(address to, uint256 amount) external {
        require(to != address(0), "MockUSDC: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @inheritdoc IERC20
    function transfer(address to, uint256 amount) external virtual override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @inheritdoc IERC20
    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @inheritdoc IERC20
    function transferFrom(address from, address to, uint256 amount) external virtual override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockUSDC: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "MockUSDC: transfer to zero address");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "MockUSDC: insufficient balance");
        balanceOf[from] = bal - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
