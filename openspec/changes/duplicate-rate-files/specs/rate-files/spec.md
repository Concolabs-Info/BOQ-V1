# Rate Files Duplication Specification

## ADDED Requirements

### Requirement: Duplicate project rate file
The system SHALL allow a user to duplicate a project rate file and all of its composition rows.

#### Scenario: Duplicate rate file from sidebar
- **GIVEN** a project rate file exists
- **WHEN** the user clicks Duplicate
- **THEN** the system creates a new rate file in the same project
- **AND** copies all Material, Labour and Machinery rows from the original
- **AND** preserves each copied row's material attributes, unit fields and rate
- **AND** selects the duplicated rate file

#### Scenario: Generate duplicate name
- **GIVEN** a rate file named `Structural rates`
- **WHEN** the user duplicates it
- **THEN** the new rate file is named `Structural rates copy`
- **AND** if that name already exists, the system uses `Structural rates copy 2`, then the next available number

#### Scenario: Preserve shared option catalogs
- **GIVEN** a rate file uses project-level dropdown options
- **WHEN** the rate file is duplicated
- **THEN** the duplicated rate file can use the same project-level options
- **AND** option catalog rows are not duplicated
