#!/bin/bash
# Full game playthrough test script
# Tests the complete game flow and verifies analytics recording

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "=== Creating game ==="
GAME_RESPONSE=$(curl -s -X POST $BASE_URL/games \
  -H "Content-Type: application/json" \
  -d '{"player": {"id": "p1", "name": "Player 1"}, "stake": 100}')

GAME_ID=$(echo $GAME_RESPONSE | jq -r '.game.gameId')
if [ "$GAME_ID" == "null" ] || [ -z "$GAME_ID" ]; then
  echo "Error: Failed to create game"
  echo "Response: $GAME_RESPONSE"
  exit 1
fi

echo "Game ID: $GAME_ID"

# Helper function to get current game phase
get_phase() {
  curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq -r '.game.phase'
}

# Helper function to get current game state summary
get_state() {
  curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq '{phase: .game.phase, p1Coins: .game.yourCoins, p2Coins: .game.theirCoins, round: .game.roundNumber}'
}

# Helper function to make a move
make_move() {
  local player=$1
  local self_col=$2
  local other_row=$3
  local response=$(curl -s -X POST $BASE_URL/games/$GAME_ID/move \
    -H "Content-Type: application/json" \
    -d "{\"playerId\": \"$player\", \"selfColumn\": $self_col, \"otherRow\": $other_row}")
  local phase=$(echo "$response" | jq -r '.game.phase')
  local error=$(echo "$response" | jq -r '.error // empty')
  if [ -n "$error" ]; then
    echo "  $player move ERROR: $error"
  else
    echo "  $player move -> phase: $phase"
  fi
}

# Helper function to make a bet
make_bet() {
  local player=$1
  local amount=$2
  local response=$(curl -s -X POST $BASE_URL/games/$GAME_ID/bet \
    -H "Content-Type: application/json" \
    -d "{\"playerId\": \"$player\", \"amount\": $amount}")
  local phase=$(echo "$response" | jq -r '.game.phase')
  local error=$(echo "$response" | jq -r '.error // empty')
  if [ -n "$error" ]; then
    echo "  $player bet $amount ERROR: $error"
  else
    echo "  $player bet $amount -> phase: $phase"
  fi
}

echo -e "\n=== Player 2 joining ==="
JOIN_PHASE=$(curl -s -X POST $BASE_URL/games/$GAME_ID/join \
  -H "Content-Type: application/json" \
  -d '{"player": {"id": "p2", "name": "Player 2"}}' | jq -r '.game.phase')
echo "Game started! Phase: $JOIN_PHASE"

# Play rounds until game ends
ROUND=1
MAX_ROUNDS=10  # Safety limit

echo -e "\n=== Playing Rounds Until Game Ends ==="
while [ $ROUND -le $MAX_ROUNDS ]; do
  PHASE=$(get_phase)
  echo -e "\n--- Round $ROUND (current phase: $PHASE) ---"
  
  if [ "$PHASE" == "ended" ]; then
    echo "Game ended!"
    break
  fi
  
  # Move 1 - Player 1 takes center columns, Player 2 takes edges
  # This should give Player 1 an advantage on the magic square
  echo -e "\n=== Move 1 ==="
  make_move "p1" 2 3
  make_move "p2" 0 0
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Bet 1 - Both players go all-in
  echo -e "\n=== Bet 1 ==="
  P1_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq -r '.game.yourCoins')
  echo "  (p1 has $P1_COINS coins available)"
  make_bet "p1" $P1_COINS
  # P2 needs to match - bet all their coins
  P2_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p2" | jq -r '.game.yourCoins')
  echo "  (p2 has $P2_COINS coins available)"
  make_bet "p2" $P2_COINS
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Move 2
  echo -e "\n=== Move 2 ==="
  make_move "p1" 3 2
  make_move "p2" 1 1
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Bet 2 - Both players bet remaining coins
  echo -e "\n=== Bet 2 ==="
  P1_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq -r '.game.yourCoins')
  echo "  (p1 has $P1_COINS coins available)"
  make_bet "p1" $P1_COINS
  P2_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p2" | jq -r '.game.yourCoins')
  echo "  (p2 has $P2_COINS coins available)"
  make_bet "p2" $P2_COINS
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Move 3
  echo -e "\n=== Move 3 ==="
  make_move "p1" 4 4
  make_move "p2" 5 5
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Bet 3 - Both players bet remaining coins
  echo -e "\n=== Bet 3 ==="
  P1_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq -r '.game.yourCoins')
  echo "  (p1 has $P1_COINS coins available)"
  make_bet "p1" $P1_COINS
  P2_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p2" | jq -r '.game.yourCoins')
  echo "  (p2 has $P2_COINS coins available)"
  make_bet "p2" $P2_COINS
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Reveal - each player reveals one of their columns
  echo -e "\n=== Reveal Phase ==="
  curl -s -X POST $BASE_URL/games/$GAME_ID/reveal \
    -H "Content-Type: application/json" \
    -d '{"playerId": "p1", "revealColumn": 2}' | jq -r '"  p1 reveal -> phase: " + .game.phase'
  
  curl -s -X POST $BASE_URL/games/$GAME_ID/reveal \
    -H "Content-Type: application/json" \
    -d '{"playerId": "p2", "revealColumn": 0}' | jq -r '"  p2 reveal -> phase: " + .game.phase'
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # Final Bet - Both players bet remaining coins
  echo -e "\n=== Final Bet ==="
  P1_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq -r '.game.yourCoins')
  echo "  (p1 has $P1_COINS coins available)"
  make_bet "p1" $P1_COINS
  P2_COINS=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p2" | jq -r '.game.yourCoins')
  echo "  (p2 has $P2_COINS coins available)"
  make_bet "p2" $P2_COINS
  
  PHASE=$(get_phase)
  if [ "$PHASE" == "ended" ]; then break; fi
  
  # End Round
  echo -e "\n=== End Round ==="
  curl -s -X POST $BASE_URL/games/$GAME_ID/end-round \
    -H "Content-Type: application/json" \
    -d '{"playerId": "p1"}' | jq -r '"  p1 end round -> phase: " + .game.phase'
  
  curl -s -X POST $BASE_URL/games/$GAME_ID/end-round \
    -H "Content-Type: application/json" \
    -d '{"playerId": "p2"}' | jq -r '"  p2 end round -> phase: " + .game.phase'
  
  PHASE=$(get_phase)
  echo "  Current phase: $PHASE"
  echo "  State: $(get_state)"
  
  if [ "$PHASE" == "ended" ]; then
    echo "Game ended after round $ROUND!"
    break
  fi
  
  if [ "$PHASE" != "roundEnd" ]; then
    echo "ERROR: Expected roundEnd phase but got $PHASE"
    break
  fi
  
  # Start next round
  echo -e "\n=== Starting Next Round ==="
  NEXT_RESPONSE=$(curl -s -X POST $BASE_URL/games/$GAME_ID/next-round \
    -H "Content-Type: application/json" \
    -d '{"playerId": "p1"}')
  
  PHASE=$(echo "$NEXT_RESPONSE" | jq -r '.game.phase')
  ERROR=$(echo "$NEXT_RESPONSE" | jq -r '.error // empty')
  
  if [ -n "$ERROR" ]; then
    echo "  Error starting next round: $ERROR"
    break
  fi
  
  echo "  New phase: $PHASE"
  echo "  State: $(get_state)"
  
  if [ "$PHASE" == "ended" ]; then
    echo "Game ended (player out of coins)!"
    break
  fi
  
  ROUND=$((ROUND + 1))
done

echo -e "\n=== Final Game State ==="
FINAL_STATE=$(curl -s "$BASE_URL/games/$GAME_ID?playerId=p1" | jq '.game | {
  phase,
  roundNumber,
  player1Coins: .yourCoins,
  player2Coins: .theirCoins,
  player1PotCoins: .yourPotCoins,
  player2PotCoins: .theirPotCoins
}')
echo "$FINAL_STATE"

echo -e "\n=== Test Complete ==="
echo "Game ID: $GAME_ID"
echo "Check analytics with:"
echo "  ./scripts/check-analytics.sh"

