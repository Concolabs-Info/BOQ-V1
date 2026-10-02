# Rate Files Dropdown Delete and Expand Specification

## MODIFIED Requirements

### Requirement: Composition dropdown options
The system SHALL allow project-scoped reusable dropdown values to be added and deleted from Rate Item drawer dropdown lists. Deleting a reusable dropdown value SHALL remove it from future dropdown choices only and SHALL NOT modify existing saved rate items.

#### Scenario: Delete reusable rate option
- **GIVEN** a reusable dropdown value appears in a Rate Item drawer dropdown
- **WHEN** the user clicks the value's delete action and confirms
- **THEN** the value is removed from that project's reusable dropdown choices
- **AND** existing saved rate items that already contain that text remain unchanged

#### Scenario: Delete default reusable rate option
- **GIVEN** a default unit option appears in a Rate Item drawer dropdown
- **WHEN** the user deletes the default value
- **THEN** the system hides that default value for the project
- **AND** the user can add the same value again later to restore it

#### Scenario: Delete material attribute catalog value
- **GIVEN** a Material attribute name or value appears in the Material attributes dropdowns
- **WHEN** the user deletes and confirms it
- **THEN** the catalog value is removed from future selection
- **AND** existing saved material rate attribute text remains unchanged

### Requirement: Main item grouped rate table
The system SHALL group rate file rows by main item and show each main item's total rate as the sum of its child row rates. Each group SHALL use an accessible chevron control for expand and collapse behavior.

#### Scenario: Toggle grouped composition with chevron
- **GIVEN** a rate file has grouped rows under a main item
- **WHEN** the user activates the group's chevron control
- **THEN** the group expands or collapses
- **AND** the control exposes the current expanded state for accessibility
