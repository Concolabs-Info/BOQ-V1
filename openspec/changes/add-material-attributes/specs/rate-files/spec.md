# Material Attributes Specification

## ADDED Requirements

### Requirement: Material-specific attributes
The system SHALL allow Material rate rows to store zero or more selected material attributes as attribute/value pairs.

#### Scenario: Save material without attributes
- **GIVEN** the user is adding a Material rate row
- **WHEN** the user saves the row without any Material attributes
- **THEN** the row is saved successfully

#### Scenario: Save material with multiple attributes
- **GIVEN** the user is adding a Material rate row for `Steel`
- **WHEN** the user selects `Diameter: 12mm` and `Appearance: Ribbed`
- **THEN** both selected attribute/value pairs are stored on the rate item

### Requirement: Reusable material attribute catalog
The system SHALL allow reusable attribute names scoped by project and material name, and reusable values scoped under one attribute.

#### Scenario: List attributes for selected material
- **GIVEN** the user selected material name `Steel`
- **WHEN** the Material attributes section loads
- **THEN** only attributes for `Steel` in the current project are available

#### Scenario: Add attribute name
- **GIVEN** the user is editing a Material row for `Steel`
- **WHEN** the user chooses `+ Add new attribute`
- **THEN** a centered modal saves the attribute name for `Steel`
- **AND** the new attribute is selected in the current row

#### Scenario: Add attribute value
- **GIVEN** the user selected the `Diameter` attribute
- **WHEN** the user chooses `+ Add new value`
- **THEN** a centered modal saves the value under `Diameter`
- **AND** the new value is selected in the current row

### Requirement: Material attribute display and search
The system SHALL display selected Material attributes inline with material details and include attribute names and values in rate item search.

#### Scenario: Show attributes in table
- **GIVEN** a Material row has supplier, brand and selected attributes
- **WHEN** the Rate Files table displays the row
- **THEN** the Details column shows values such as `Supplier · Brand · Diameter: 12mm · Appearance: Ribbed`

## MODIFIED Requirements

### Requirement: Rate file composition items
The Material `type` field from `add-rate-file-compositions` is superseded by repeatable Material attributes.
