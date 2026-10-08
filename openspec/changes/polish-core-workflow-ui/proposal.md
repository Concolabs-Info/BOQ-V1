# Polish Core Workflow UI

## Why

Projects, Review, Type Summary, and BOQ use different corner sizes, table treatments, and action emphasis. A shared visual language will make these production screens easier to scan without changing how work is saved or navigated.

## What Changes

- Apply consistent 8px corners to rectangular cards and controls in the core project workflow.
- Use neutral surfaces and restrained borders, reserving strong blue for primary actions, active navigation, and selection.
- Refine the Quanto workflow header and step navigation while preserving its title and project actions.
- Align Review, Type Summary, and BOQ table typography, density, numeric alignment, and hover states.
- Keep secondary actions visible with quieter styling and clearer primary actions.

## Boundaries

- Leave the sidebar layout and content unchanged.
- Preserve existing API calls, route destinations, review confirmation, BOQ rate and export behavior, and browser-local resize preferences.
- Do not add backend contracts or dependencies.

## Implementation Outcome

- Projects cards use neutral metadata dividers and quiet secondary links; Create Project and save actions remain prominent.
- The shared Quanto header has clearer title/step spacing, with horizontal step navigation on narrow screens. The sidebar was not changed.
- Review, Type Summary, and BOQ tables use stronger headers, compact rows, consistent numeric alignment, and the existing hover, selection, resize, and scroll behavior.
- BOQ Download remains the primary toolbar action; template, refresh, settings, and Add item remain visible with secondary styling.
- The resizable wrapper now uses a no-op server storage adapter and applies saved layouts after hydration, preserving browser-local widths without the Review/Type Summary server-render warning.
- Typecheck, syntax check, targeted ESLint, OpenSpec validation, and desktop/tablet/mobile layout checks passed. The available BOQ project had no item rows, so rate picking and a completed export were not exercised in manual verification.
