# Projects UI Specification

## ADDED Requirements

### Requirement: Project create shadcn refresh
The system SHALL render the Create Project page as a centered, compact shadcn/ui card while preserving existing project creation behavior.

#### Scenario: Consistent project form and overview corners
- **GIVEN** the user opens the create form or editable project overview
- **WHEN** cards, fields and actions render
- **THEN** their rectangular corners use the same radius as the Projects dashboard cards and buttons

#### Scenario: Show centered create form
- **GIVEN** the user opens the Create Project page
- **WHEN** the form renders
- **THEN** the form is centered in a compact card
- **AND** the card uses a clear Project details title and helper description

#### Scenario: Create project with existing fields
- **GIVEN** the user fills the create-project form
- **WHEN** the user submits the form
- **THEN** the same project create API payload fields are sent as before
- **AND** Project name remains required
- **AND** optional blank fields are submitted as null values

#### Scenario: Choose initial project status
- **GIVEN** the user opens the Create Project page
- **WHEN** the form renders
- **THEN** the Status field defaults to Active
- **WHEN** the user selects Active, On hold, Completed or Archived and creates the project
- **THEN** the selected status is sent to the create project API
- **AND** omitting a status still creates the project as Active

#### Scenario: Show description character count
- **GIVEN** the user edits the Description field
- **WHEN** the description changes
- **THEN** the page shows the current character count out of 1000

#### Scenario: Disable form while saving
- **GIVEN** a project create request is in progress
- **WHEN** the request has not finished
- **THEN** all form fields and actions are disabled
- **AND** the submit button reads `Creating...`

#### Scenario: Preserve create navigation
- **GIVEN** the user is on the Create Project page
- **WHEN** the user cancels
- **THEN** the user returns to the Projects page
- **WHEN** project creation succeeds
- **THEN** the user is redirected to the new project overview/edit page

#### Scenario: Show saved project description after creation
- **GIVEN** the user creates a project with a Description value
- **WHEN** the new project workspace opens
- **THEN** the saved description is visible in the project overview
- **AND** the description remains editable in the project details form

#### Scenario: Change project status from overview
- **GIVEN** the user opens an existing project overview
- **WHEN** the user selects Active, On hold, Completed or Archived in the Project status control
- **AND** saves the status
- **THEN** the existing project update API persists the selected status
- **AND** the overview shows the saved status as a readable badge

#### Scenario: Delete project from overview
- **GIVEN** the user opens an existing project overview
- **WHEN** the user activates Delete project
- **THEN** the system shows a destructive confirmation dialog
- **WHEN** the user confirms deletion
- **THEN** the existing delete project API is called
- **AND** the user is redirected to the Projects page
- **WHEN** the user cancels the dialog
- **THEN** the project remains unchanged
