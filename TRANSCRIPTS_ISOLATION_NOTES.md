# Transcripts Isolation – What was implemented, where, and why it's not complete yet

This document captures exactly what I changed to make Recall transcripts (and Meetings Hub data) visible only to the relevant user, the assumptions behind those changes, and the remaining issues blocking a complete solution. Use this as a precise brief for further work.

## Goal

- Each authenticated user should only see their own meeting transcripts and spaces, unless a space has been explicitly shared with them.
- Transcript List (direct from Recall) should only show items for the calling user.
- Webhook ingestion should assign ownership correctly so DB reads enforce isolation.

## Data model changes (Supabase)

- Added `owner_id UUID` to `spaces` and `notes`.
- Added mapping table `recall_bots(bot_id TEXT PRIMARY KEY, user_id UUID, meeting_url TEXT, status TEXT, transcript_id TEXT, created_at TIMESTAMPTZ)`.
- Created indexes on `spaces(owner_id)`, `notes(owner_id)`, `recall_bots(user_id)`.
- Planned RLS policies (in `SUPABASE_MIGRATION.sql`) to restrict reads/writes by `auth.uid()` (not yet fully enabled due to backfill concerns).

Relevant file: `SUPABASE_MIGRATION.sql` (appended section 9)

## Server endpoints updated

### 1) Meetings Hub data

File: `api/meetings-data.js`

- Changed to require auth token (reads `sb_access_token` from Authorization/Cookies).
- First query mode: fetch notes by `owner_id = current_user`.
- Fallback: if no notes, attempt to fetch from a user-owned "Meetings" space (not global).
- Returns `success: true` with empty list when no personal data is found.

Known limitation: legacy notes without `owner_id` will not appear for their original creator until backfilled.

### 2) Transcript List (Recall)

File: `api/recall-transcript-list.js`

- Removed old allowlist.
- Authenticate caller, load `bot_id`s from `recall_bots where user_id = current_user`.
- Call Recall transcript listing and filter items to those mapped `bot_id`s only. Items without a mapped `bot_id` are skipped.

Known limitation: transcripts for bots created before the mapping existed will be filtered out (no mapping).

### 3) Bot List (Recall)

File: `api/recall-bot-list.js`

- Authenticate caller, load mapped `bot_id`s for that user, list Recall bots and filter to allowed IDs only.

### 4) Webhook storage (Recall)

File: `api/recall-webhook.js`

- On receipt, verify signature (if provided), extract `bot_id`.
- Look up `user_id` from `recall_bots` for that `bot_id`.
- Insert note with `owner_id = user_id` and target a user-owned Meetings space if available.

Known limitation: If `bot_id` has no mapping, the webhook cannot determine ownership.

### 5) Bot creation flow (Supabase Function)

File: `supabase/functions/recall-create-bot/index.ts`

- Accepts `meeting_url`, authenticates caller via Supabase.
- Calls Recall to create a bot.
- Persists `bot_id → user_id` in `recall_bots`.

Assumption: All production bot creations should flow through this function so the mapping is always written.

## Client-side changes

### 1) Always send auth token for protected endpoints

File: `src/main.js`

- All calls to `/api/meetings-data`, `/api/recall-transcript-list`, `/api/recall-bot-list` now attach `Authorization: Bearer <sb_access_token>`.
- Fixed one path in Meetings search that previously called `/api/meetings-data` without a token.

### 2) Spaces listing

File: `src/lib/supabase.js` (`db_listSpaces`)

- Client-side filter to return only spaces where `owner_id === current_user.id` (temporary until RLS backfill).

### 3) Baseline spaces

File: `src/main.js` (`ensureBaselineSpaces`)

- Now only creates `Chats` and `Deep Researches` per user. Removed auto-creation of a global "Meetings" space.

## What is NOT working and why

1) Legacy transcripts/spaces created before `owner_id` & mapping
   - Many existing rows have `owner_id` = NULL. The new logic hides them (correct for isolation), but creators won’t see their old items until we backfill.
   - The Recall list filters rely on `recall_bots`; bots created outside `recall-create-bot` have no mapping, so Transcript List appears empty for those.

2) RLS is not fully enabled yet
   - We postponed enabling strict RLS until after backfill to avoid “disappearing data” complaints. Without RLS, mistakes in server handlers can still over-fetch, so we added client/server-side filters as safeguards.

3) Some UI flows assumed a global "Meetings" space
   - Meetings Hub initially used a global space and mixed users. We removed that, but any flow still assuming a shared space needs migration.

## Minimal backfill plan (to finish isolation)

1) Backfill `owner_id` on `spaces` and `notes`:

```sql
-- Example – customize logic to set the correct owner for legacy rows
-- If you have a profiles table that relates emails → id, join it here.
UPDATE spaces SET owner_id = /* deduced user id */ WHERE owner_id IS NULL;
UPDATE notes  SET owner_id = /* deduced user id */ WHERE owner_id IS NULL;
```

2) For legacy bots, create mappings:

```sql
-- Manually map known bot_ids to user_ids (one-off)
INSERT INTO recall_bots (bot_id, user_id)
VALUES ('<legacy_bot_id>', '<user_uuid>')
ON CONFLICT (bot_id) DO UPDATE SET user_id = EXCLUDED.user_id;
```

3) Enable RLS (already drafted in `SUPABASE_MIGRATION.sql`).

## Optional helper endpoint (recommended)

Add an admin-only route to claim a `bot_id` for a specific user:

```http
POST /api/recall-claim-bot
Body: { "bot_id": "...", "user_id": "..." }
Auth: Admin only
Action: upsert into recall_bots
```

## Summary – Why isolation isn’t complete yet

- Ownership wasn’t recorded historically; without backfill, we must hide legacy content or it will leak.
- Transcript List depends on `recall_bots` mapping; unmapped legacy bots will not appear.
- Full RLS is pending backfill; until then, isolation is enforced by endpoint and client filtering.

## Files touched (for reference)

- `SUPABASE_MIGRATION.sql` – owner_id + recall_bots + RLS draft
- `supabase/functions/recall-create-bot/index.ts` – writes bot→user mapping
- `api/recall-webhook.js` – saves notes with owner_id from mapping
- `api/meetings-data.js` – owner_id-scoped meetings
- `api/recall-bot-list.js` – filters bots to mapped IDs
- `api/recall-transcript-list.js` – filters transcripts to mapped IDs
- `src/main.js` – auth token on fetches; routing/search fixes; baseline spaces
- `src/lib/supabase.js` – client space filtering by owner_id


