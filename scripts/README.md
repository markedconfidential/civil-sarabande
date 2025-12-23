# Scripts

Utility scripts for testing and development.

## test-game-playthrough.sh

Full game playthrough test script that exercises the complete game flow and verifies analytics recording.

### Usage

1. Start the server in one terminal:
   ```bash
   bun run dev
   ```

2. Run the test script in another terminal:
   ```bash
   ./scripts/test-game-playthrough.sh
   ```

### What it does

- Creates a new game with Player 1
- Player 2 joins the game (starts the game timer)
- Plays through a complete round:
  - 3 move phases (each player makes 3 moves)
  - 3 betting phases
  - Reveal phase
  - Final betting phase
  - Round end
- Starts the next round
- Displays final game state

### Environment Variables

- `BASE_URL`: Server URL (default: `http://localhost:3001`)

### Verifying Analytics

After the script completes, check the database for recorded analytics:

```bash
sqlite3 data/civil-sarabande.db \
  "SELECT * FROM game_history ORDER BY ended_at DESC LIMIT 1;"
```

Or with better formatting:

```bash
sqlite3 -header -column data/civil-sarabande.db \
  "SELECT game_id, player1_name, player2_name, 
   duration_seconds, winner, loser, 
   player1_net_change, player2_net_change, who_left 
   FROM game_history ORDER BY ended_at DESC LIMIT 1;"
```

### Requirements

- `curl` - for making HTTP requests
- `jq` - for parsing JSON responses (install with `brew install jq` on macOS)
- Server must be running on the specified BASE_URL

