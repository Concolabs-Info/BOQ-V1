# BOQ UI Specification

## ADDED Requirements

### Requirement: Readable BOQ report surface
The system SHALL use the core visual system for the BOQ toolbar, report table, and supporting sections.

#### Scenario: Scan BOQ items
- **GIVEN** BOQ items are visible
- **WHEN** a user scans the report table
- **THEN** item rows retain a subtle hover state and resizable columns
- **AND** quantity, rate, and amount columns are consistently right aligned
- **AND** bill, section, and subtotal rows remain distinct from item rows

#### Scenario: Use BOQ actions
- **GIVEN** the BOQ toolbar is visible
- **WHEN** a user downloads, refreshes, changes settings, adds an item, or selects a rate
- **THEN** Download is the primary toolbar action while secondary actions remain visible
- **AND** existing disabled states, export formats, drawers, and API behavior remain intact

## Implementation Notes

The BOQ toolbar uses shadcn buttons for primary and secondary commands, while the report uses compact row spacing and tabular numeric values. The Download menu still exposes PDF, Excel, CSV, JSON, and Export history. The available project had no BOQ item rows during manual verification, so rate selection and a completed export were not tested through the browser.
