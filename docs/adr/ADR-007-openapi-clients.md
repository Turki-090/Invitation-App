# ADR-007: OpenAPI client strategy

Status: accepted.

`openapi/openapi.yaml` is the sole source of truth for the public HTTP contract.
NestJS decorators must not maintain a second runtime schema. The canonical file is
linted directly and generates the checked-in TypeScript client schema in
`packages/api-client/src/generated/schema.ts`.

Run `pnpm openapi:generate` after changing the contract. CI runs
`pnpm openapi:check` before generation so stale client output fails immediately,
then compiles API consumers and the runtime Zod compatibility assertions. Swift
and Kotlin generation remain part of the native-client phase, using the same
canonical document.
