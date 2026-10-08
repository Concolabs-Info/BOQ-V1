# Refresh Projects Dashboard UI

## Why
The Projects page uses basic native controls and custom card markup, making the project library feel less polished than newer workspace surfaces. The page should adopt the shadcn/ui component system while keeping the existing project listing behavior.

## What Changes
- Replace the native status dropdown with a shadcn/ui single-select status filter.
- Replace the search input with a shadcn/ui input and search icon.
- Replace project card markup with shadcn/ui cards.
- Show color-aware project status badges.
- Show skeleton cards for initial loading.
- Preserve existing project search, status filtering, pagination and navigation behavior.

## Impact
- Adds shadcn/ui components for Select, Card, Badge, Input and Skeleton.
- Updates the frontend `/projects` route only.
- Does not change backend project APIs, project status types or response shapes.
