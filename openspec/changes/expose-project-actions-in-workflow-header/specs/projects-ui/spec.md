# Projects UI Specification

## ADDED Requirements

### Requirement: Workflow header project actions
The system SHALL expose project management actions from workspace workflow pages while preserving the workflow navigation.

#### Scenario: Open project actions from workflow header
- **GIVEN** the user is on a workspace workflow page such as `/workspace/:projectId/pre/upload`
- **WHEN** the page header renders
- **THEN** a three-dot project actions menu is visible near the project header title
- **AND** the existing workflow navigation remains visible

#### Scenario: Edit project details from workflow header
- **GIVEN** the project actions menu is open on a workflow page
- **WHEN** the user chooses Edit project details
- **THEN** the user is navigated to `/workspace/:projectId`
- **AND** the project overview allows editing project details

#### Scenario: Change project status from workflow header
- **GIVEN** the project actions menu is open on a workflow page
- **WHEN** the user chooses Active, On hold, Completed or Archived from Change status
- **THEN** the existing project update API persists the selected status
- **AND** the action is disabled while the update is in progress

#### Scenario: Delete project from workflow header
- **GIVEN** the project actions menu is open on a workflow page
- **WHEN** the user chooses Delete project
- **THEN** the system shows a destructive confirmation dialog
- **WHEN** the user confirms deletion
- **THEN** the existing delete project API deletes the project
- **AND** the user is redirected to `/projects`
- **WHEN** the user cancels deletion
- **THEN** the project remains unchanged

### Requirement: Project overview route is the project landing route
The system SHALL use `/workspace/:projectId` as the project overview/edit landing route and keep `/workspace/:projectId/pre/upload` for workflow upload.

#### Scenario: Open project overview links
- **GIVEN** a project overview/details link is shown in the product
- **WHEN** the user opens that link
- **THEN** the user lands on `/workspace/:projectId`

#### Scenario: Continue workflow links
- **GIVEN** a Continue Project or workflow upload link is shown in the product
- **WHEN** the user opens that link
- **THEN** the user lands on `/workspace/:projectId/pre/upload`
