# Skirting — Measurement and Validation Rules

This file contains the shared measurement, evidence and review rules used when deriving skirting. It must never assume that every room edge receives the same skirting.


## NRM2 and floor rule notes

These are the Floor facts already present in the project NRM2 extracted source. Keep them in the
rule engine, not in AI prompts.

## WS28 — Floor, wall, ceiling and roof finishings

Project source: `NRN2 document text extracted.txt`, around lines 19535-19825.

- Item 1 — Screeds, beds and toppings: `m/m²`, thickness and coats stated.
- Item 2 — Finish to floors: `m/m²`, type and overall thickness stated.
- Both split at `≤600 mm wide` and `>600 mm wide`.
- Falls/slope classifications are stated separately.
- Background/backing/bedding/underlay/insulation facts may be required in description/classification.
- Work section inclusions state work in forming voids/holes `≤1 m²`; do not simply delete every
  small geometric hole from measured finish.
- Item 14 — Skirtings: `m`, net height stated, with raking/sloping/curved/background facts where
  applicable.

## WS19 — Waterproofing

Project source: `NRN2 document text extracted.txt`, around lines 16390-16530.

- Coverings `>500 mm wide`: `m²`.
- Coverings `≤500 mm wide`: `m`.
- Area is measured in contact with the base.
- No deduction for voids `≤1 m²`.
- Boundary work is separate and includes work at external perimeter, abutments and larger openings;
  the source notes upstands/downstands among included boundary work.

## IMPLEMENTATION RULE

Store the raw geometry of every hole/opening/edge even when NRM says “do not deduct”. The quantity
ledger should show the physical deduction candidate and the rule decision that retained it in the
measured quantity. This keeps the takeoff auditable.


## Evidence and user questions

## EVIDENCE PRINCIPLE

Every extracted/confirmed fact keeps its source. Example:

```text
finish_code F05
  source: finish schedule row 8

zone assignment F05
  source: blue hatch on finish plan + legend swatch

skirting height 100mm
  source: room finish schedule cell
```

## QUESTION TYPES

### anomaly
Something conflicts or looks implausible.

Examples:

- room schedule says F03 but plan tag says F05;
- model polygon crosses a wall;
- a void label sits inside an accepted floor finish zone;
- secondary finish plan registration is poor.

### guidance
Information needed to finish the takeoff is absent.

Examples:

- skirting type/height not stated;
- threshold between different finishes is unclear;
- waterproofing extent is not given;
- floor finish code exists but no definition can be found.

## QUESTION CONTENT

Each question should contain:

- affected object IDs;
- short human-readable issue;
- relevant source crop(s)/bbox(es);
- proposed options when safe;
- no hidden default.

## RULE VERSIONING

Measurement/classification/description/aggregation rules are data and have versions. A rule fix
should allow re-billing confirmed geometry without rerunning AI extraction.
