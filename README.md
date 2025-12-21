# Civil Sarabande

A crypto-enabled reimagining of Cordial Minuet.

## Project Structure

```
civil-sarabande/
├── packages/
│   ├── server/      # Game server (Bun + TypeScript)
│   ├── shared/      # Shared types and utilities
│   ├── web/         # Frontend (SvelteKit) - coming soon
│   └── contracts/   # Solidity smart contracts - coming soon
├── reference/       # Original Cordial Minuet source for reference
└── ...
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later

### Setup

```bash
bun install
```

### Running the dev server

```bash
bun run dev
```

### Running tests

```bash
bun test
```

### Type checking

```bash
bun run typecheck
```

## Reference

The `reference/` directory contains the original Cordial Minuet source code:
- `reference/server/` - PHP server implementation with game logic
- `reference/server/protocol.txt` - API protocol documentation
- `reference/server/magicSquare6.cpp` - Magic square generation algorithm
- `reference/gameSource/` - C++ client source

## License

See `no_copyright.txt`

