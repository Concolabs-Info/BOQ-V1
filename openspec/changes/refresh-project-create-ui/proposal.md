# Refresh Project Create UI

## Why
The Create Project page still uses custom form styling while the Projects dashboard has moved to shadcn/ui. The create workflow should feel focused, centered and consistent with the project library refresh without changing project creation behavior.

## What Changes
- Center the create-project form in a compact card.
- Convert the custom form shell to shadcn/ui Card composition.
- Replace native form controls with shadcn/ui Input, Textarea and Button components.
- Show a subtle description character counter.
- Disable all fields and actions while a project is being created.
- Preserve existing validation, payload, cancellation and redirect behavior.

## Impact
- Adds a shadcn/ui Textarea component.
- Updates the frontend `/projects/new` route and ProjectCreateForm UI only.
- Does not change backend project APIs or project create types.
