# Rate Files Composition Specification

> Superseded note: `add-material-attributes` replaces the Material `type` field with repeatable Material attributes.

## ADDED Requirements

### Requirement: Rate file composition items
The system SHALL allow a project rate file to contain Material, Labour, Machinery and Percentage rows grouped by item type.

#### Scenario: Add material composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Material row
- **THEN** the system stores material name, supplier, brand, attributes, unit type, unit detail and rate

#### Scenario: Add labour composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Labour row
- **THEN** the system stores name, group, unit type, unit detail and rate

#### Scenario: Add machinery composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Machinery row
- **THEN** the system stores name, source, location, unit type, unit detail and rate

#### Scenario: Add percentage composition row
- **GIVEN** a selected project rate file
- **WHEN** the user adds a Percentage row
- **THEN** the system stores name and percentage without a rate value
- **AND** the Percentage numeric field is labeled `Percentage (%)`
- **AND** the row is not used for BOQ pricing or automatic matching in this version

#### Scenario: Reject incomplete composition row
- **GIVEN** the user saves a rate item
- **WHEN** rate or the type-specific name is missing
- **THEN** the system rejects the row with validation feedback

#### Scenario: Reject incomplete percentage row
- **GIVEN** the user saves a Percentage rate item
- **WHEN** name or percentage is missing or percentage is negative
- **THEN** the system rejects the row with validation feedback

### Requirement: Composition dropdown options
The system SHALL allow project-scoped reusable dropdown values for material name, supplier, brand, labour name, labour group, machinery name, machinery source and type-specific unit values.

#### Scenario: Add dropdown value from drawer
- **GIVEN** the user is adding or editing a composition row
- **WHEN** the user selects `+ Add another ...` inside a dropdown
- **THEN** a centered modal asks for the new value
- **AND** after saving, the value is available for that project and selected in the current drawer

### Requirement: Type grouped rate table
The system SHALL group rate file rows into Material, Labour, Machinery and Percentage lists.

#### Scenario: Show type grouped rates
- **GIVEN** a rate file has Material, Labour, Machinery and Percentage rows
- **WHEN** the Rate Files table loads
- **THEN** the rows appear under Material list, Labour list, Machinery list and Percentage list headings
- **AND** no main item field is shown in the add/edit drawer

#### Scenario: Filter grouped rates by type and rate
- **GIVEN** the Rate Files table is visible
- **WHEN** the user selects type checkboxes or enters Rate from/to values
- **THEN** the table shows only rows matching the selected types and inclusive rate range
- **AND** no selected type checkbox means all types are included

### Requirement: BOQ material-only compatibility
The system SHALL keep BOQ rate matching and manual BOQ rate selection limited to Material rows until full composition pricing is implemented.

#### Scenario: BOQ loads selected rate file
- **GIVEN** a selected rate file contains Material, Labour, Machinery and Percentage rows
- **WHEN** the BOQ loads rate items for matching or manual selection
- **THEN** only Material rows are loaded for BOQ pricing

## MODIFIED Requirements

### Requirement: Material-only rate items without element category
This requirement from `add-project-rate-files` is superseded. Rate files are no longer material-only; they now support Material, Labour, Machinery and Percentage composition rows.
