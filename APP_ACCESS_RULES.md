# Application Access & Data Isolation Rules

## Core Principles

- Users can only see data they created unless it has been explicitly shared with them.
- Sharing must be explicit, with clear, human-readable permissions and owners.
- Users can always review:
  - Items they shared with others
  - Items that others shared with them
- Hive AI must only access the content of the logged-in user and public content.
  - Users cannot query AI about other users’ private content.
  - Only Master Admins may query across all users.

## Master Admins (allowed to query all content)
- ggg@fvtura.com
- g@fvtura.com

## Enforcement Strategy

- Database-level isolation via Supabase Row Level Security (RLS).
- All server/edge endpoints must resolve the authenticated `user_id` and enforce owner-level filters.
- RAG/search calls MUST include the user’s JWT to Supabase functions so RLS is enforced on the vector search side.
- UI should visually distinguish private vs shared items and allow filtering by ownership and visibility. The app now exposes tabs in `My Library` for `My Spaces`, `Shared with me`, and `Public`.

## Sharing Model (High-Level)

- Each record has an `owner_id` and optional `visibility`/`sharing` metadata. Values: `private`, `team`, `shared` (public-compatible). Legacy `public` is normalized to `shared` on save.
- Sharing to users by email or user id, with roles (viewer/editor/owner).
- Shared-with and shared-by lists should be queryable by the user.

## AI Access Rules

- Default: AI context is user’s own content + public content.
- If the user is a Master Admin, they may optionally broaden scope to all users.
- Requests must pass the Supabase JWT (from the logged-in session) to the Supabase Function to ensure RLS is applied.

## Developer Checklist

- [ ] On every data fetch, filter by `owner_id = current_user_id` unless explicitly querying shared/public items.
- [ ] Surface sharing state in the UI for each item.
- [ ] Provide views: “Shared with me” and “Shared by me”.
- [ ] Pass JWT to Supabase functions for RAG/search and rely on RLS for isolation.
- [ ] Edge endpoints must resolve `user_id` from Supabase and reject unauthenticated requests.
- [ ] Admin-only endpoints must validate requester email against the Master Admin list.

## Notes

- Never broaden AI or data queries to include other users’ private content unless the requester is a Master Admin.
- Avoid caching shared data globally; cache per-user where needed.
