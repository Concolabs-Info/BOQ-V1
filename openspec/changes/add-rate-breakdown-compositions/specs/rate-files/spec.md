# Rate Breakdown Compositions Specification

## ADDED Requirements

### Requirement: Rate Breakdown analysis compositions
The system SHALL store project-scoped Rate Breakdown analyses as main-item compositions loaded from Norm records and priced from a selected Rate File.

#### Scenario: Create analysis from Norm main item
- **GIVEN** the user is on the Rate Breakdown page
- **AND** a Rate File is selected
- **WHEN** the user clicks Add
- **THEN** a centered modal lists Norm main item names
- **WHEN** the user selects a Norm main item
- **THEN** the system loads the Norm child rows into an analysis table
- **AND** Item Description, Unit and Quantity come from the selected Norm child rows

#### Scenario: Select matching rates
- **GIVEN** a loaded Rate Breakdown analysis row
- **WHEN** the row is Material, Labor or Machinery
- **THEN** the Rate column shows a dropdown of rates from the selected Rate File with the same type and exact normalized item name
- **AND** duplicate rate choices include distinguishing details such as supplier, brand, attributes, source, location, unit and rate
- **WHEN** the user selects a rate
- **THEN** the amount is calculated as quantity multiplied by selected rate
- **AND** the closed Rate cell continues to show the selected rate name, distinguishing details and rate value

#### Scenario: Calculate percentage row
- **GIVEN** a loaded Rate Breakdown analysis has rows above a Percentage row
- **WHEN** the table calculates the Percentage row
- **THEN** the row does not require a Rate File rate
- **AND** the amount is calculated as the previous subtotal multiplied by the percentage quantity divided by 100

#### Scenario: Enter manual rate
- **GIVEN** a loaded Rate Breakdown analysis row is Material, Labor or Machinery
- **WHEN** the user opens the Rate picker
- **THEN** the picker includes `+ Manual rate`
- **WHEN** the user clicks `+ Manual rate`
- **THEN** a centered modal asks for a required non-negative rate and optional note
- **WHEN** the user saves the manual rate
- **THEN** the row stores no linked Rate File item
- **AND** the closed Rate cell shows the manual note, defaulting to `Manual rate`, and the rate value
- **AND** the amount is calculated as quantity multiplied by the manual rate
- **AND** changing the selected Rate File clears the manual rate selection

#### Scenario: Save analysis snapshot
- **GIVEN** the user saves a Rate Breakdown analysis
- **WHEN** the analysis is stored
- **THEN** copied Norm row descriptions, units and quantities are preserved
- **AND** selected rate labels, rate values and calculated amounts are saved as snapshots
- **AND** later Norm or Rate File edits do not automatically change the saved analysis

#### Scenario: Show summary rows
- **GIVEN** a Rate Breakdown analysis is visible
- **WHEN** row amounts are calculated
- **THEN** the system shows summary rows for total for `1 cube`, rate for cube, rate say `1 cube`, rate say `1 ft3`, and rate say `1 m3`
- **AND** `1 ft3` is calculated as cube rate divided by 100
- **AND** `1 m3` is calculated as ft3 rate multiplied by 35.3147

#### Scenario: View saved analysis inline
- **GIVEN** the user has saved Rate Breakdown analyses
- **WHEN** the user clicks a saved main item name
- **THEN** that row expands to show a readonly analysis table inline
- **AND** the readonly table shows Item Description, Unit, Quantity, Rate, Amount and summary rows
- **AND** the readonly Rate cells use saved selected rate labels and rate values rather than live Rate File values
- **AND** only one saved analysis needs to be expanded at a time

## MODIFIED Requirements

### Requirement: Rate Breakdown structure
The structure-only Rate Breakdown behavior from `add-project-rate-files` is superseded by saved analysis compositions loaded from Norm main items.
