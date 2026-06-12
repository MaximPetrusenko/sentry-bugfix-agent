# ADR 001: ESM + TypeScript strict mode

**Status**: Accepted  
**Date**: 2024-01-01

## Context

The project needs a module system and TypeScript configuration. Node.js 22 has stable ESM support. The Anthropic SDK and MCP SDK are both published as ESM-first packages.

## Decision

Use `"type": "module"` (ESM) with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in `tsconfig.json`. Enable TypeScript strict mode with additional strictness flags: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`.

## Consequences

- All imports use explicit `.js` extensions (even for `.ts` source files) — this is a NodeNext requirement and can surprise developers unfamiliar with this pattern.
- No CommonJS `require()`. Third-party packages that are CJS-only require dynamic import or explicit interop.
- `exactOptionalPropertyTypes` catches a class of bugs where optional properties are set to `undefined` when they should be absent. Worth the extra verbosity.
- `noUncheckedIndexedAccess` forces handling of potential `undefined` from array/record index access. Catches real bugs at the cost of some `!` assertions or explicit undefined checks.

## Alternatives considered

- CommonJS: rejected. Both major dependencies are ESM-first; CommonJS would require CJS interop shims and is the legacy path.
- Looser tsconfig: rejected. This project's credibility rests on its safety — strict typing is the first line of defense against integration errors.
