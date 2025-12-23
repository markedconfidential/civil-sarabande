#!/bin/bash
# Check analytics and game status

DB_PATH="${DB_PATH:-packages/server/data/civil-sarabande.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

echo "=== Active Games ==="
sqlite3 -header -column "$DB_PATH" <<EOF
SELECT 
  game_id,
  phase,
  player1_name,
  player2_name,
  round_number,
  player1_coins,
  player2_coins,
  datetime(created_at/1000, 'unixepoch') as created,
  datetime(started_at/1000, 'unixepoch') as started
FROM games
ORDER BY created_at DESC
LIMIT 10;
EOF

echo -e "\n=== Game History (Completed Games) ==="
sqlite3 -header -column "$DB_PATH" <<EOF
SELECT 
  game_id,
  player1_name,
  player2_name,
  datetime(started_at/1000, 'unixepoch') as started,
  datetime(ended_at/1000, 'unixepoch') as ended,
  duration_seconds,
  winner,
  loser,
  player1_net_change,
  player2_net_change,
  who_left,
  final_round_number
FROM game_history
ORDER BY ended_at DESC
LIMIT 10;
EOF

echo -e "\n=== Summary ==="
ACTIVE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM games;")
COMPLETED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM game_history;")
echo "Active games: $ACTIVE"
echo "Completed games (with analytics): $COMPLETED"

if [ "$COMPLETED" -eq 0 ] && [ "$ACTIVE" -gt 0 ]; then
  echo -e "\nNote: Analytics are only recorded when a game reaches the 'ended' phase."
  echo "Games end when:"
  echo "  - A player runs out of coins"
  echo "  - A player leaves mid-game"
  echo "  - Both players complete rounds until someone can't afford the ante"
fi

