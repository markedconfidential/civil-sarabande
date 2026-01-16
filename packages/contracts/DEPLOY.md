# Deployment Guide for Base Sepolia

This guide will help you deploy the GameEscrow contract to Base Sepolia testnet.

## Prerequisites

1. **Foundry installed** - If not already installed:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Deployer wallet** - A wallet with some ETH on Base Sepolia for gas fees
   - Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Or use: https://app.chainlink.com/faucets/base-sepolia

3. **Server wallet address** - The address that will be authorized to call payout/cancel functions
   - If you have the server wallet private key, you can get the address using:
     ```bash
     node get-server-address.js <your-server-private-key>
     ```

4. **BaseScan API key** (optional but recommended for verification)
   - Get one at: https://basescan.org/myapikey

## Setup

1. **Create a `.env` file** in `packages/contracts/` with the following variables:

   ```bash
   # Deployer wallet private key (without 0x prefix, or with it - both work)
   DEPLOYER_PRIVATE_KEY=your_deployer_private_key_here
   
   # USDC contract address on Base Sepolia (already set)
   USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8
   
   # Server wallet address (the address authorized for payouts/cancellations)
   SERVER_WALLET_ADDRESS=0x...
   
   # BaseScan API key for contract verification (optional)
   BASESCAN_API_KEY=your_basescan_api_key_here
   ```

2. **Get your server wallet address** (if you have the private key):
   ```bash
   cd packages/contracts
   node get-server-address.js <SERVER_WALLET_PRIVATE_KEY>
   ```
   Copy the address and use it for `SERVER_WALLET_ADDRESS` in your `.env` file.

## Deploy

Run the deployment script:

```bash
cd packages/contracts
forge script script/Deploy.s.sol:DeployScript --rpc-url base_sepolia --broadcast --verify
```

Or use the npm script:

```bash
cd packages/contracts
npm run deploy:sepolia
```

## After Deployment

1. **Save the deployed contract address** - The script will output the contract address. Save it to:
   - `packages/server/.env` as `GAME_ESCROW_CONTRACT_ADDRESS`
   - `packages/web/.env` as `VITE_ESCROW_CONTRACT_ADDRESS`

2. **Verify the deployment** on BaseScan:
   - Visit: https://sepolia.basescan.org
   - Search for your contract address
   - Verify it's deployed and verified correctly

## Important Notes

- The deployer wallet needs ETH for gas fees
- The server wallet address is set in the constructor and cannot be changed after deployment
- Make sure the server wallet has the private key stored securely in `packages/server/.env` as `SERVER_WALLET_PRIVATE_KEY`
- The USDC address on Base Sepolia is: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8`
