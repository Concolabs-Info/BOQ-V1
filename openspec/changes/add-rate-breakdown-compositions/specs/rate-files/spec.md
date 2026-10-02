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
- **WHEN** the row is Material, Labor, Machinery or Percentage
- **THEN** the Rate column shows a dropdown of rates from the selected Rate File with the same type and overlapping meaningful word tokens
- **AND** number, fraction and punctuation tokens are ignored during matching
- **AND** duplicate rate choices include distinguishing details such as supplier, brand, attributes, source, location, unit and rate
- **AND** the dropdown includes a client-side search field that filters the already-matched options by visible details
- **WHEN** the user selects a rate
- **THEN** non-Percentage amounts are calculated as quantity multiplied by selected rate
- **AND** Percentage amounts are calculated as previous subtotal multiplied by selected percentage divided by 100
- **AND** the closed Rate cell continues to show the selected rate or percentage name, distinguishing details and value

#### Scenario: Calculate percentage row
- **GIVEN** a loaded Rate Breakdown analysis has rows above a Percentage row
- **WHEN** the Percentage row has a selected Rate File Percentage item
- **THEN** the amount is calculated as the previous subtotal multiplied by the selected Percentage value divided by 100
- **AND** the Norm quantity remains visible as copied Norm data but does not control the priced amount
- **WHEN** no Percentage item is selected
- **THEN** the row may be saved without a calculated amount

#### Scenario: Enter manual rate
- **GIVEN** a loaded Rate Breakdown analysis row is Material, Labor, Machinery or Percentage
- **WHEN** the user opens the Rate picker
- **THEN** the picker includes `+ Manual rate` for non-Percentage rows and `+ Manual percentage` for Percentage rows
- **WHEN** the user clicks the manual action
- **THEN** a centered modal asks for a required non-negative rate or percentage and optional note
- **WHEN** the user saves the manual value
- **THEN** the row keeps the manual value in the draft
- **WHEN** the user saves the full Rate Breakdown analysis
- **THEN** the system creates a matching Rate File item in the selected Rate File for rows without a linked rate item
- **AND** the saved breakdown row stores the new linked Rate File item snapshot
- **AND** manual non-Percentage rows copy the Rate Breakdown Unit cell into Rate File `unit_type`
- **AND** manual non-Percentage rows copy Rate Breakdown Quantity plus Unit into Rate File `unit_detail`, such as `2 day`
- **AND** manual Percentage rows create Rate File Percentage items with name and percentage but no rate value
- **AND** manual Percentage rows do not copy unit fields
- **AND** the closed Rate cell shows the selected label and value
- **AND** changing the selected Rate File clears the manual selection

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
