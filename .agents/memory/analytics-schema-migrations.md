---
name: Analytics schema migrations
description: Safe handling of additive database changes when existing commute analytics rows are present.
---

When extending the commute analytics schema, preserve existing event rows. A noninteractive Drizzle schema push can stop on a prompt asking whether to truncate a populated events table before adding a uniqueness constraint.

**Why:** Historical analytics are part of the product and must not be discarded just to apply a new dedupe rule.

**How to apply:** Prefer additive nullable columns, unique indexes that tolerate existing nulls, and `CREATE TABLE IF NOT EXISTS` for new registry tables. Apply these changes only to the intended development database, then verify the existing row count is preserved before publishing.