# Review UI Specification

## ADDED Requirements

### Requirement: Resizable review page sections
The system SHALL allow users to resize the primary Review page sections horizontally on desktop-sized screens.

#### Scenario: Resize review panels
- **GIVEN** the user opens `/workspace/:projectId/review` on a desktop-sized viewport
- **WHEN** the user drags a handle between Floors, Review table or Details sections
- **THEN** the adjacent sections resize horizontally
- **AND** the Review table remains usable
- **AND** the existing review navigation, selection and confirmation actions remain available

#### Scenario: Preserve smaller screen usability
- **GIVEN** the user opens the Review page on a smaller viewport
- **WHEN** the page renders
- **THEN** cramped horizontal resize handles are not shown
- **AND** the sections remain usable in a stacked or responsive layout

#### Scenario: Remember review panel layout
- **GIVEN** the user has resized Review page sections
- **WHEN** the user refreshes the page
- **THEN** the section sizes are restored from browser storage for that project

### Requirement: Resizable review table columns
The system SHALL allow users to resize every visible Review table column.

#### Scenario: Scan Review table rows
- **GIVEN** Review table rows are visible
- **WHEN** the user hovers a row
- **THEN** the row shows a clear light blue background
- **AND** the selected row remains distinguishable when not hovered

#### Scenario: Resize every table column
- **GIVEN** the Review table is visible
- **WHEN** the user drags a column resize handle in the table header
- **THEN** that column width changes
- **AND** matching body cells use the same width
- **AND** the sticky table header remains aligned with rows

#### Scenario: Remember review table columns
- **GIVEN** the user has resized Review table columns
- **WHEN** the user refreshes the page
- **THEN** the column widths are restored from browser storage for that project

### Requirement: Resizable Type Summary page
The system SHALL allow users to resize the Type Summary table and selected classification details sections on desktop-sized screens.

#### Scenario: Resize Type Summary panels
- **GIVEN** the user opens `/workspace/:projectId/review/classifications` on a desktop-sized viewport
- **WHEN** the user drags the handle between the classifications table and details sections
- **THEN** the adjacent sections resize horizontally
- **AND** the selected classification details remain usable

#### Scenario: Remember Type Summary panel layout
- **GIVEN** the user has resized Type Summary sections
- **WHEN** the user refreshes the page
- **THEN** the section sizes are restored from browser storage for that project

### Requirement: Resizable Type Summary table columns
The system SHALL allow users to resize every visible Type Summary table column.

#### Scenario: Resize Type Summary table columns
- **GIVEN** the Type Summary table is visible
- **WHEN** the user drags a column resize handle in the table header
- **THEN** that column width changes
- **AND** matching body cells use the same width
- **AND** the sticky table header remains aligned with rows

#### Scenario: Remember Type Summary table columns
- **GIVEN** the user has resized Type Summary table columns
- **WHEN** the user refreshes the page
- **THEN** the column widths are restored from browser storage for that project

### Requirement: Type Summary filters use shadcn-styled controls
The system SHALL render Type Summary filters with consistent shadcn-styled controls while preserving existing data flow.

#### Scenario: Filter Type Summary by floor
- **GIVEN** the user opens the Type Summary page
- **WHEN** the user selects All floors or a specific floor
- **THEN** the existing review state query is requested with the selected floor
- **AND** the selected classification resets

#### Scenario: Search Type Summary classifications
- **GIVEN** Type Summary classification groups are loaded
- **WHEN** the user enters search text
- **THEN** the visible groups are filtered by type code, label, measure, material, floor, or status text
- **AND** no backend API request is required for search-only changes
