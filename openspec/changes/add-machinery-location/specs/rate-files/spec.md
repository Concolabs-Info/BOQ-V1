# Machinery Location and Attribute Content Specification

## ADDED Requirements

### Requirement: Optional machinery location
The system SHALL allow Machinery rate rows to store an optional free-text location when a machinery source is selected.

#### Scenario: Show location after selecting source
- **GIVEN** the user is adding or editing a Machinery rate row
- **WHEN** the user selects any Source value
- **THEN** the system shows a Location text field below Source

#### Scenario: Save machinery location
- **GIVEN** the user selected a Machinery Source
- **WHEN** the user enters a Location and saves the row
- **THEN** the Location is trimmed and stored with the Machinery rate row

#### Scenario: Clear location when source is cleared
- **GIVEN** the user entered a Machinery Location
- **WHEN** the user clears the Machinery Source
- **THEN** the Location is cleared and hidden

#### Scenario: Display machinery details
- **GIVEN** a Machinery row has both Source and Location
- **WHEN** the Rate Files table displays the row
- **THEN** the Details column shows `Source · Location`

### Requirement: Search machinery location
The system SHALL include Machinery Location text in rate item search.

#### Scenario: Search by machinery location
- **GIVEN** a Machinery row has Location `Colombo yard`
- **WHEN** the user searches for `Colombo`
- **THEN** the matching Machinery row is included in the results

## MODIFIED Requirements

### Requirement: Material attributes wording
The Material attribute value selection UI SHALL use the wording Attribute content instead of Attribute value.

#### Scenario: Select attribute content
- **GIVEN** the user adds a Material attribute row
- **WHEN** no content is selected
- **THEN** the attribute content dropdown placeholder reads `Attribute content`

#### Scenario: Add attribute content
- **GIVEN** the user chooses to add content under an attribute name
- **WHEN** the centered modal opens
- **THEN** its title, label and validation copy refer to Attribute content
