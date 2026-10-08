# Projects UI Specification

## ADDED Requirements

### Requirement: Projects dashboard shadcn refresh
The system SHALL render the Projects page as a professional dashboard using shadcn/ui components while preserving existing project listing behavior.

#### Scenario: Consistent project library surfaces
- **GIVEN** the user is on the Projects page
- **WHEN** project cards, card actions, filters and sidebar navigation render
- **THEN** card and button corners use a consistent radius
- **AND** the active sidebar item is identified without a colored left border

#### Scenario: Filter projects by status
- **GIVEN** the user is on the Projects page
- **WHEN** the user selects All projects, Active, On hold, Completed or Archived from the status dropdown
- **THEN** the page applies the selected status filter using the existing projects list API
- **AND** pagination resets to the first page
- **AND** only one status filter is active at a time

#### Scenario: Search projects while typing
- **GIVEN** the user enters search text on the Projects page
- **WHEN** the user pauses typing briefly
- **THEN** the page applies the search using the existing projects list API
- **AND** pagination resets to the first page
- **AND** search requests are debounced so the API is not called for every keystroke

#### Scenario: Clear project search
- **GIVEN** search text is present on the Projects page
- **WHEN** the user activates the clear search control
- **THEN** the search input is cleared
- **AND** the unfiltered project list is reloaded through the existing projects list API

#### Scenario: Show project status badges
- **GIVEN** project cards are visible
- **WHEN** a project status is Active, On hold, Completed or Archived
- **THEN** the card shows a readable color-aware badge for that status

#### Scenario: Show project descriptions in cards
- **GIVEN** project cards are visible
- **WHEN** a project has a description
- **THEN** the card shows the description in the card body
- **WHEN** a project has no description
- **THEN** the card shows a clear empty description label

#### Scenario: Show initial loading skeletons
- **GIVEN** the Projects page is loading without cached project results
- **WHEN** the first project list request is in progress
- **THEN** the page shows skeleton project cards
- **AND** once existing results are visible, later refreshes may use a lightweight Updating label instead of replacing cards with skeletons

#### Scenario: Preserve project navigation
- **GIVEN** a project card is visible
- **WHEN** the user clicks Project details or Continue Project
- **THEN** Project details opens the project overview/edit route
- **AND** Continue Project opens the workflow upload route

#### Scenario: Open project card actions
- **GIVEN** a project card is visible
- **WHEN** the user opens the card action menu
- **THEN** the menu shows Edit details, Change status and Delete project actions
- **WHEN** the user selects Edit details
- **THEN** the existing project overview route is opened

#### Scenario: Change project status from card
- **GIVEN** a project card action menu is open
- **WHEN** the user selects a different project status
- **THEN** the existing project update API persists the selected status
- **AND** the visible card badge updates without requiring a full page reload

#### Scenario: Delete project from card
- **GIVEN** a project card action menu is open
- **WHEN** the user selects Delete project
- **THEN** the system shows a destructive confirmation dialog
- **WHEN** the user confirms deletion
- **THEN** the existing delete project API is called
- **AND** the project is removed from the visible list
- **AND** the visible total count is decremented
- **WHEN** the user cancels the dialog
- **THEN** the project remains visible
