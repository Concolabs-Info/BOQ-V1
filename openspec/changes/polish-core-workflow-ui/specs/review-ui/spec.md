# Review UI Specification

## ADDED Requirements

### Requirement: Readable review tables
The system SHALL present Review and Type Summary as compact, readable production tables.

#### Scenario: Scan and select review rows
- **GIVEN** Review or Type Summary table rows are visible
- **WHEN** a user scans, hovers, or selects a row
- **THEN** the header, row separators, hover, and selected state are visually distinct
- **AND** quantities use a consistent right alignment
- **AND** existing row selection, detail editing, and confirmation actions remain available

#### Scenario: Resize review layout
- **GIVEN** a user resizes panels or table columns
- **WHEN** the page renders again
- **THEN** existing browser-local width persistence and sticky header behavior remain intact

#### Scenario: Review actions
- **GIVEN** a user reviews measured items or classifications
- **WHEN** the page actions render
- **THEN** the relevant confirmation or Continue to BOQ action is prominent
- **AND** secondary actions remain visible and keyboard accessible

## Implementation Notes

Review gives Confirm selected primary emphasis when rows are checked and Confirm all primary emphasis otherwise. Type Summary keeps category cards and a prominent Continue to BOQ action. Both tables retain their existing panel and column resize behavior, with numeric quantities aligned right and compact row spacing. The shared resizable wrapper restores browser-local layouts after hydration so server and client markup agree.
