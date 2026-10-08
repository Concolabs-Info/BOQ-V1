# BOQ UI Specification

## ADDED Requirements

### Requirement: BOQ table item row hover
The system SHALL provide a subtle hover state for BOQ item rows to improve scanability.

#### Scenario: Hover BOQ item row
- **GIVEN** the BOQ table contains item rows
- **WHEN** the user hovers a normal or excluded item row
- **THEN** the row background changes subtly
- **AND** the hover edge uses a soft blue accent
- **AND** excluded rows keep their reduced-opacity treatment
- **AND** bill headers, section headers and subtotal rows do not present as selectable item rows

### Requirement: BOQ toolbar download menu
The system SHALL expose BOQ download options from an accessible shadcn/ui-style dropdown menu in the BOQ toolbar.

#### Scenario: Open download options
- **GIVEN** the BOQ toolbar Download button is enabled
- **WHEN** the user hovers, clicks or keyboard-focuses the Download button
- **THEN** the menu shows PDF, Excel, CSV, JSON and Export history options

#### Scenario: Select download option
- **GIVEN** the BOQ download menu is open
- **WHEN** the user selects PDF, Excel, CSV or JSON
- **THEN** the existing BOQ export flow runs for that format

#### Scenario: Open export history
- **GIVEN** the BOQ download menu is open
- **WHEN** the user selects Export history
- **THEN** the existing BOQ export history drawer opens

#### Scenario: Disable stale or saving downloads
- **GIVEN** BOQ export actions are disabled because the BOQ is stale or saving
- **WHEN** the user points at or focuses the Download button
- **THEN** the download menu does not open

### Requirement: BOQ table column resizing
The system SHALL allow users to resize every visible BOQ table column.

#### Scenario: Resize BOQ table columns
- **GIVEN** the BOQ table is visible
- **WHEN** the user drags a column resize handle in the table header
- **THEN** that column width changes within its allowed range
- **AND** body cells stay aligned with the header
- **AND** hidden Rate or Amount columns are not shown when disabled in BOQ settings

#### Scenario: Remember BOQ table columns
- **GIVEN** the user has resized BOQ table columns
- **WHEN** the user refreshes the BOQ page for the same project
- **THEN** the column widths are restored from browser storage for that project

### Requirement: BOQ shadcn Select controls
The system SHALL use shadcn/ui Select controls for primary BOQ dropdowns on the main BOQ page and export drawer.

#### Scenario: Use shadcn Select for BOQ filters
- **GIVEN** the BOQ page is visible
- **WHEN** the user changes the template, floor filter, element filter or rate file selector
- **THEN** the visible control uses the shadcn Select component
- **AND** the existing state changes, API calls and refetch behavior remain unchanged

#### Scenario: Use shadcn Select for export options
- **GIVEN** the BOQ download drawer is visible
- **WHEN** the user changes the export layout or selected floor
- **THEN** the visible control uses the shadcn Select component
- **AND** the selected values continue to control the existing export actions

#### Scenario: Preserve empty selections
- **GIVEN** a BOQ dropdown supports an empty option such as All floors, No rate file or Select floor
- **WHEN** the user selects that option
- **THEN** the UI maps the internal sentinel value back to the existing null or all-state behavior
