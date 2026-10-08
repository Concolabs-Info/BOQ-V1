# Workflow UI Specification

## ADDED Requirements

### Requirement: Clear Quanto workflow header
The system SHALL present the shared workflow header with a readable title and active step while keeping existing navigation and project management actions.

#### Scenario: Identify the active stage
- **GIVEN** a user opens a PRE, TAKEOFF, REVIEW, or BOQ route
- **WHEN** the workflow header renders
- **THEN** Quanto remains the header title
- **AND** the active stage and substep, when applicable, are easy to distinguish
- **AND** horizontal navigation remains usable on narrow screens

#### Scenario: Use project actions
- **GIVEN** a user opens the project actions menu in the header
- **WHEN** they edit details, change status, or request deletion
- **THEN** the existing routes, API calls, loading states, and confirmation behavior remain unchanged

## Implementation Notes

The shared office header keeps Quanto and the project actions menu in place. Step labels have clearer active, completed, and pending styling, visible keyboard focus, and horizontal overflow on narrow screens without changing route destinations. The sidebar remains unchanged.
