# Rate Breakdown Analysis Compositions

## Summary
Convert Rate Breakdown from structure-only rows into saved analysis compositions loaded from Norm main items and priced from a selected Rate File.

## Motivation
Users need to convert Norm compositions into analysis tables where row quantities come from Norm and rates come from Rate Files, with saved snapshots and screenshot-style summary rates.

## Scope
- Add persisted Rate Breakdown parent/row composition storage.
- Load Norm main items through the Rate Breakdown Add flow.
- Use a selected Rate File for row rate dropdowns.
- Calculate normal row amounts from quantity and rate.
- Calculate Percentage rows from the previous subtotal.
- Show `1 cube`, `1 ft3`, and `1 m3` summary rows.
