# Expose Project Actions in Workflow Header

## Summary

Add project management actions to workflow pages so users can edit project details, change status, and delete a project without leaving pages like `/workspace/:projectId/pre/upload` by guessing the overview URL.

## Motivation

The editable project overview exists at `/workspace/:projectId`, but workflow pages currently show no obvious edit or management action in the header. Users who land directly in the workflow cannot discover project editing from the visible UI.

## Proposed Changes

- Make `/workspace/:projectId` the default project overview/edit landing route.
- Keep `/workspace/:projectId/pre/upload` as the workflow upload route.
- Add a project actions menu near the workflow header title.
- Include Edit project details, Change status, and Delete project actions.
- Reuse existing project update/delete APIs and shadcn/ui menu/dialog components.

## Out of Scope

- No backend API changes.
- No new project fields.
- No soft-delete/archive behavior.
