# Shared Roof System — Evidence and Source Handling

## Evidence-first rule

Every important Roof fact should be traceable to where it came from.

Examples:

```text
Roof polygon → Roof Plan page 14
Pitch 30° → Pre Section A-A evidence
R02 → Roof Plan page 14
R02 definition → Roof Schedule page 22
Insulation → Specification clause 7.4
Upstand height 300 mm → Detail 5/A301
Reinforcement 18 kg/m² → User-derived factor
```

## Evidence record

Store at least:

- evidence id
- source document/asset id
- source revision
- page
- crop/bbox if relevant
- source type
- raw text/value
- normalized value
- confidence
- extraction method
- created time/version

## Source types

- Gemini Pre classification
- PDF text extraction
- PDF vector extraction
- OpenAI roof detection
- schedule/specification extraction
- section evidence
- user edit
- derived factor
- deterministic calculation

## Revision handling

Never silently mix evidence from different drawing revisions.

When a new source revision arrives:

- keep old evidence for audit
- mark old candidates superseded when appropriate
- rerun only affected analysis
- identify user edits that need reconciliation

## Typical/repeated roofs

If the project explicitly identifies repeated/typical roof systems, allow family reuse. Do not multiply geometry by a factor unless the scope is clearly confirmed.

## Missing information

Use two types of questions:

### Evidence conflict
Two sources disagree.

### Guidance/missing information
The project does not provide a required fact.

Example:

`Roof geometry is confirmed but no roof covering system is stated.`

The user can select/create a family instead of forcing another AI geometry call.

## Provenance of derived quantities

Factor-derived concrete/reinforcement/framing must show:

- factor
- unit
- basis area
- source/assumption
- confirmation status

This prevents estimates from looking like measured quantities.
