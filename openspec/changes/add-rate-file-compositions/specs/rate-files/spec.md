# Rate Files Composition Specification

> Superseded note: `add-material-attributes` replaces the Material `type` field with repeatable Material attributes.

## ADDED Requirements

### Requirement: Rate file composition items
The system SHALL allow a project rate file to contain Material, Labour and Machinery rows grouped by main item.

#### Scenario: Add material composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Material row
- **THEN** the system stores main item, material name, supplier, brand, type, unit type, unit detail and rate

#### Scenario: Add labour composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Labour row
- **THEN** the system stores main item, name, group, unit type, unit detail and rate

#### Scenario: Add machinery composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Machinery row
- **THEN** the system stores main item, name, source, unit type, unit detail and rate

#### Scenario: Reject incomplete composition row
- **GIVEN** the user saves a rate item
- **WHEN** main item, unit type, rate or the type-specific name is missing
- **THEN** the system rejects the row with validation feedback

### Requirement: Composition dropdown options
The system SHALL allow project-scoped reusable dropdown values for main item, material name, supplier, brand, type, labour name, labour group, machinery name, machinery source and unit type.

#### Scenario: Add dropdown value from drawer
- **GIVEN** the user is adding or editing a composition row
- **WHEN** the user selects `+ Add another ...` inside a dropdown
- **THEN** a centered modal asks for the new value
- **AND** after saving, the value is available for that project and selected in the current drawer

### Requirement: Main item grouped rate table
The system SHALL group rate file rows by main item and show each main item's total rate as the sum of its child row rates.

#### Scenario: Show grouped composition
- **GIVEN** a rate file has Material, Labour and Machinery rows under `Concrete`
- **WHEN** the Rate Files table loads
- **THEN** `Concrete` appears as an expandable group
- **AND** the group total equals the sum of its child row rates

### Requirement: BOQ material-only compatibility
The system SHALL keep BOQ rate matching and manual BOQ rate selection limited to Material rows until full composition pricing is implemented.

#### Scenario: BOQ loads selected rate file
- **GIVEN** a selected rate file contains Material, Labour and Machinery rows
- **WHEN** the BOQ loads rate items for matching or manual selection
- **THEN** only Material rows are loaded for BOQ pricing

## MODIFIED Requirements

### Requirement: Material-only rate items without element category
This requirement from `add-project-rate-files` is superseded. Rate files are no longer material-only; they now support Material, Labour and Machinery composition rows.
