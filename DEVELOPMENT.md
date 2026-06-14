# Development Setup

Reluctocracy v0 uses TypeScript on Node, with Vitest for the conformance harness.
The crypto substrate is intentionally v0-scoped: Ed25519 signatures and SHA-256
content addressing are real primitives, while later trust-root pieces such as
ZK membership and production beacons remain cleanly swappable stubs.

## Commands

```sh
npm install
npm run build
npm run lint
npm test
npm run verify
```

## Stack Decision

- Runtime: Node.js with TypeScript.
- Tests: Vitest.
- Crypto libraries: `@noble/ed25519` and `@noble/hashes`.

This stack keeps the reference implementation close to the eventual text-based
web platform while making deterministic event replay and executable invariants
straightforward to express.
