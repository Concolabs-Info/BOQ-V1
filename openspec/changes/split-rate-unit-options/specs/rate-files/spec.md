# Rate Files Unit Options Specification

## MODIFIED Requirements

### Requirement: Composition dropdown options
The system SHALL allow project-scoped reusable dropdown values for main item, material name, supplier, brand, labour name, labour group, machinery name and machinery source. Unit type dropdown values SHALL be reusable per project and per rate item category: Material, Labour or Machinery.

#### Scenario: Add category-specific unit type
- **GIVEN** the user is adding or editing a Material, Labour or Machinery row
- **WHEN** the user selects `+ Add another ...` inside the Unit type dropdown
- **THEN** the new unit type is saved only for that row category
- **AND** the new unit type does not appear in the other row categories' Unit type dropdowns

#### Scenario: Show category-aware unit placeholder
- **GIVEN** the user is adding or editing a rate item row
- **WHEN** the row category is Material, Labour or Machinery
- **THEN** the Unit textbox placeholder reflects examples appropriate for that category
