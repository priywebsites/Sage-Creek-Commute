---
name: OpenAPI numeric fields
description: Compatibility rule for OpenAPI-generated Zod schemas in this workspace
---

Use `type: number` for new numeric OpenAPI request fields when the generated Zod client must run against the workspace’s Zod 3 dependency.

**Why:** The installed generator emits `z.int()` for OpenAPI `integer`, but this project’s Zod version does not expose that API. Code generation succeeds while library typechecking fails.

**How to apply:** Keep the numeric constraints such as `minimum` in OpenAPI, run the API code generator, and verify the generated Zod output before changing dependencies.