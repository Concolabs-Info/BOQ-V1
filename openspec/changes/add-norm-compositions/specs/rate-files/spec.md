# Norm Compositions Specification

## ADDED Requirements

### Requirement: Norm main-item compositions
The system SHALL store Norm records as project-scoped main-item compositions with one or more child rows.

#### Scenario: Save composition
- **GIVEN** the user enters a Main item name
- **AND** adds at least one Material, Labor, Machinery or Percentage row
- **WHEN** the user saves the drawer
- **THEN** the system stores one Norm composition with nested child rows

#### Scenario: Reject empty composition
- **GIVEN** the user opens the Norm drawer
- **WHEN** the user saves without a Main item name or without child rows
- **THEN** the system rejects the save

#### Scenario: Validate child row fields
- **GIVEN** a Norm composition child row
- **WHEN** the row is Material, Labor or Machinery
- **THEN** name, unit and non-negative quantity are required
- **WHEN** the row is Percentage
- **THEN** name and non-negative quantity are required and unit is not required

### Requirement: Norm composition drawer
The system SHALL open a drawer directly when the user clicks Add in the Norm page.

#### Scenario: Add child rows in drawer
- **GIVEN** the Norm drawer is open
- **WHEN** the user clicks Material, Labor, Machinery or Percentage
- **THEN** a matching child row section is appended
- **AND** the type buttons are placed in the sticky drawer footer so they remain available while scrolling
- **AND** each visible type section has a plus icon for adding another row of that same type
- **AND** each visible type section renders its child rows in a compact editable table
- **AND** Percentage rows do not show a Unit column
- **AND** Percentage rows label their numeric column as `Percentage (%)`, while other rows label it as Quantity

### Requirement: Expandable Norm table
The system SHALL display Norm main items as top-level table rows that expand with a chevron arrow.

#### Scenario: Expand composition
- **GIVEN** a Norm composition has Material, Labor, Machinery and Percentage rows
- **WHEN** the user expands the main item row
- **THEN** the child rows are shown grouped by type
- **AND** the expand control uses a chevron arrow, not a plus icon

## MODIFIED Requirements

### Requirement: Project norm items
The flat Norm item behavior from `add-project-rate-files` is superseded by main-item compositions. Existing flat Norm rows are cleared by the composition migration rather than migrated.
