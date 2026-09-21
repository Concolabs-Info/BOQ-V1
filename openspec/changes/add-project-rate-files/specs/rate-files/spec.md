# Rate Files Specification

## ADDED Requirements

### Requirement: Project-scoped rate files
The system SHALL allow each project to own multiple rate files.

#### Scenario: List project rate files
- **GIVEN** a project has rate files
- **WHEN** the frontend requests that project's rate files
- **THEN** only rate files for that project are returned

#### Scenario: Create rate file from popup
- **GIVEN** the user is on the Rate Files page
- **WHEN** the user clicks Add rate file
- **THEN** a centered modal asks for the rate file name before creating it

#### Scenario: Delete project rate file
- **GIVEN** a project rate file has material items
- **WHEN** the rate file is deleted
- **THEN** its material items are deleted with it

### Requirement: Material-only rate items without element category
The system SHALL allow material rate items with material name, optional specification, optional size, unit cost, markup percentage and unit type. The system SHALL NOT store or require an element category for rate items.

#### Scenario: Add material with specification and size
- **GIVEN** a selected project rate file
- **WHEN** the user adds `RCC concrete` with specification `Grade C25/30` and size `610*305`
- **THEN** the material name, specification and size are stored separately
- **AND** no element category is stored

#### Scenario: Add material without specification or size
- **GIVEN** a selected project rate file
- **WHEN** the user adds a material with no specification or size
- **THEN** the item is saved with blank specification and size values

#### Scenario: Search material rates
- **GIVEN** a rate file contains material names, specification values and size values
- **WHEN** the user searches by material name, specification text, size text or unit type
- **THEN** matching rate items are available for selection

#### Scenario: Show rate column
- **GIVEN** a rate item has unit cost and markup
- **WHEN** the rate file table displays the item
- **THEN** the calculated selling value is shown under the `Rate` column

#### Scenario: Show clear empty values in rate table
- **GIVEN** a rate item has no specification, size or unit value
- **WHEN** the rate file table displays the item
- **THEN** the table shows muted labels such as `No specification`, `No size` or `No unit`
- **AND** the table does not use dash-only placeholders for these values

#### Scenario: Row actions menu
- **GIVEN** a material rate row exists
- **WHEN** the user opens the three-dots action menu
- **THEN** Edit and Delete actions are available

#### Scenario: Delete material rate with centered modal
- **GIVEN** a material rate row exists
- **WHEN** the user chooses Delete from the row actions menu
- **THEN** a centered confirmation modal shows the material rate details
- **AND** the material rate is only deleted when the user confirms the modal action

### Requirement: Project-scoped rate dropdown options
The system SHALL allow project-scoped dropdown values for unit types and specifications.

#### Scenario: Seed default specification
- **GIVEN** a project has no custom specification options
- **WHEN** the Rate Files form opens
- **THEN** `Grade C25/30` is available as a specification option

#### Scenario: Add custom specification
- **GIVEN** the user is adding or editing a material rate
- **WHEN** the user selects `+ Add another specification` inside the Specification dropdown
- **THEN** a centered modal asks for the new specification value
- **AND** the current dropdown value is preserved until the new value is saved
- **WHEN** the value is saved
- **THEN** the value is saved for the project and becomes selectable in future rate items
- **AND** the new value is selected for the current item

#### Scenario: Add custom unit type
- **GIVEN** the user is adding or editing a material rate
- **WHEN** the user selects `+ Add another unit type` inside the Unit type dropdown
- **THEN** a centered modal asks for the new unit type value
- **AND** the current dropdown value is preserved until the new value is saved
- **WHEN** the value is saved
- **THEN** the value is saved for the project and becomes selectable in future rate items
- **AND** the new value is selected for the current item

#### Scenario: Use centered modals for rate workflows
- **GIVEN** the user creates a rate file, adds a dropdown value or selects a BOQ row rate
- **WHEN** a popup is required
- **THEN** the system displays a centered modal with a dim backdrop, title, helper text, close control, validation state and footer actions
- **AND** the system does not use browser prompt dialogs

### Requirement: Rate Files workspace navigation
The system SHALL expose Rate Files as a direct project workspace sidebar option.

#### Scenario: Open rate files page
- **GIVEN** the user is inside a project workspace
- **WHEN** the user clicks Rate Files
- **THEN** the user is taken to the project's Rate Files page

### Requirement: BOQ rate file selection
The system SHALL allow a project BOQ to select one project rate file for pricing.

#### Scenario: Select project rate file for BOQ
- **GIVEN** a project has one or more rate files
- **WHEN** the user selects a rate file above the BOQ table
- **THEN** the selected rate file is saved for that project

### Requirement: Exact BOQ rate auto-fill
The system SHALL auto-fill BOQ row rates from the selected rate file only by material name, exact normalized unit and exact normalized size matching. The system SHALL NOT use element category, specification, ML, or score-based partial matching for automatic pricing.

#### Scenario: Auto apply exact material, unit and size match
- **GIVEN** a BOQ row and a rate item have matching normalized units
- **AND** every meaningful token from the rate item's material name appears in the BOQ row item code, section or description text
- **AND** the rate item has a size value
- **AND** the BOQ row text contains the same normalized size, ignoring spacing and `x`/`×`/`*` formatting differences
- **WHEN** exactly one rate item matches
- **THEN** the rate item's rate is applied to the BOQ row and the amount is calculated

#### Scenario: Do not auto apply when material name does not match
- **GIVEN** a BOQ row and a rate item have matching normalized unit and size
- **BUT** the rate item's material name tokens do not appear in the BOQ row text
- **WHEN** automatic matching runs
- **THEN** the rate item is not applied automatically

#### Scenario: Do not auto apply without selected rate file
- **GIVEN** no rate file is selected above the BOQ table
- **WHEN** the BOQ table is displayed
- **THEN** no rate file amount is auto-applied

#### Scenario: Do not auto apply conflicting exact matches
- **GIVEN** multiple rate items exactly match the same BOQ row by material name, unit and size
- **WHEN** the BOQ is displayed
- **THEN** no automatic rate is applied and the user can choose a rate manually

#### Scenario: Do not display match column
- **GIVEN** the BOQ table is displayed
- **WHEN** a rate file is selected or not selected
- **THEN** the table does not show a Match column or match summary chips

#### Scenario: Show clear empty values in BOQ table
- **GIVEN** a BOQ row has no rate or no calculated amount
- **WHEN** the BOQ table displays the row
- **THEN** the table shows muted labels such as `No rate` or `Not priced`
- **AND** the table does not use dash-only placeholders for these values

#### Scenario: Prompt once for multiple BOQ row changes
- **GIVEN** automatic pricing changes multiple BOQ rows
- **WHEN** the user needs to save or discard those pending BOQ row edits
- **THEN** the system shows one grouped unsaved-changes prompt for BOQ row changes
- **AND** Save or Discard applies to the grouped BOQ row changes together instead of prompting row by row

### Requirement: BOQ row rate popup assignment
The system SHALL allow the user to assign a rate item from the selected rate file through a popup opened from each BOQ row's Rate cell.

#### Scenario: Open rate picker from Rate cell
- **GIVEN** a BOQ row is visible
- **WHEN** the user clicks the plus or edit button in the Rate cell
- **THEN** a popup opens with the selected rate file, a search field and rate items from that file

#### Scenario: Apply selected rate
- **GIVEN** a BOQ row rate picker is open
- **WHEN** the user selects a rate item
- **THEN** the rate is applied to that row, the amount is recalculated and a remembered mapping is saved

#### Scenario: Manual mapping wins
- **GIVEN** a BOQ row has a saved manual mapping
- **WHEN** the selected rate file is loaded again
- **THEN** the remembered rate item is applied before automatic unit and size matching

#### Scenario: No row-click inspector
- **GIVEN** the BOQ table is displayed
- **WHEN** the user clicks a row outside the Rate cell action
- **THEN** no BOQ row inspector opens for rate assignment
