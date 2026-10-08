# Projects UI Specification

## ADDED Requirements

### Requirement: Consistent core project surfaces
The system SHALL present the Projects list, create form, and editable overview with consistent rectangular corners, spacing, and action hierarchy.

#### Scenario: Inspect project cards and forms
- **GIVEN** a user views Projects, project creation, or project overview
- **WHEN** cards, fields, and buttons render
- **THEN** rectangular surfaces use consistent 8px corners and restrained neutral borders
- **AND** the main action is visually stronger than secondary navigation or cancel actions

#### Scenario: Preserve project workflows
- **GIVEN** a user searches, filters, creates, edits, or deletes a project
- **WHEN** the corresponding action is taken
- **THEN** existing validation, API behavior, confirmation, and navigation remain available

#### Scenario: Read a project card
- **GIVEN** the Projects list contains project cards
- **WHEN** a user scans a card
- **THEN** the project name and code lead the card, with status and last-updated date grouped in the header
- **AND** the description and client, location, and organization metadata are separated by one restrained neutral divider
- **AND** Create Project and Continue Project remain stronger than secondary details links

## Implementation Notes

The create form and overview retain their existing fields, validation, status controls, and destinations. Their primary save actions use the same control height as the Projects list action. Project cards no longer reserve a large minimum height, and the loading skeleton mirrors the compact layout.
