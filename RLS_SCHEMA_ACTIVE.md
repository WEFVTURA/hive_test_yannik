# Active RLS (Row Level Security) Schema

This document captures the current RLS policies in production after enabling isolation.

## Overview
- **RLS is ENABLED** on: `spaces`, `notes`, `recall_bots`
- All policies enforce `owner_id = auth.uid()` for user isolation
- Service role can bypass RLS for webhook operations

## Current RLS Policies

### SPACES Table
| Policy | Command | Rule |
|--------|---------|------|
| Users can view own spaces | SELECT | `owner_id = auth.uid()` |
| Users can insert own spaces | INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| Users can update own spaces | UPDATE | `owner_id = auth.uid()` |
| Users can delete own spaces | DELETE | `owner_id = auth.uid()` |
| spaces_owner_all | ALL | `owner_id = auth.uid()` |
| spaces_owner_select | SELECT | `owner_id = auth.uid()` |
| spaces_owner_insert | INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| spaces_owner_update | UPDATE | `owner_id = auth.uid()` |
| spaces_owner_delete | DELETE | `owner_id = auth.uid()` |
| spaces_shared_read | SELECT | `visibility = 'shared'` |
| spaces_shared_select | SELECT | `visibility = 'shared'` |
| spaces_team_select | SELECT | `visibility = 'team'` |

### NOTES Table
| Policy | Command | Rule |
|--------|---------|------|
| Users can view own notes | SELECT | `owner_id = auth.uid()` |
| Users can insert own notes | INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| Users can update own notes | UPDATE | `owner_id = auth.uid()` |
| Users can delete own notes | DELETE | `owner_id = auth.uid()` |
| notes_owner_all | ALL | `owner_id = auth.uid()` |
| notes_owner_select | SELECT | `owner_id = auth.uid() OR EXISTS (space owner check)` |
| notes_owner_insert | INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| notes_owner_update | UPDATE | `owner_id = auth.uid() OR EXISTS (space owner check)` |
| notes_owner_delete | DELETE | `owner_id = auth.uid() OR EXISTS (space owner check)` |

**Space owner check**: User owns the space containing the note:
```sql
EXISTS (
  SELECT 1 FROM spaces s 
  WHERE s.id = notes.space_id 
  AND s.owner_id = auth.uid()
)
```

### RECALL_BOTS Table
| Policy | Command | Rule |
|--------|---------|------|
| Users can view own bot mappings | SELECT | `user_id = auth.uid()` |
| recall_bots_owner_select | SELECT | `user_id = auth.uid()` |
| recall_bots_owner_insert | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| recall_bots_owner_update | UPDATE | `user_id = auth.uid()` |
| recall_bots_owner_delete | DELETE | `user_id = auth.uid()` |
| Service role can manage all bot mappings | ALL | `auth.jwt() ->> 'role' = 'service_role'` |

## Key Security Points

1. **User Isolation**: All user operations are restricted to `owner_id = auth.uid()` or `user_id = auth.uid()`
2. **Service Role Bypass**: Webhooks and backend services use service_role to bypass RLS
3. **Space-Note Relationship**: Users can access notes in spaces they own
4. **Shared Spaces**: Limited support for shared/team visibility (SELECT only)
5. **Insert Policies**: Some INSERT policies have `null` qual, relying on WITH CHECK constraints

## Testing Isolation

To verify RLS is working:
```sql
-- As User A, try to see User B's data (should return empty)
SELECT * FROM notes WHERE owner_id = 'other-user-uuid';
SELECT * FROM spaces WHERE owner_id = 'other-user-uuid';
SELECT * FROM recall_bots WHERE user_id = 'other-user-uuid';
```

## Notes on Duplicate Policies

Some tables have duplicate policies (e.g., both "Users can view own spaces" and "spaces_owner_select"). This is likely from:
1. Initial simple policies from our migration
2. Pre-existing policies that were already in the database
3. Both achieve the same isolation goal

The duplicates don't cause issues - Postgres uses OR logic between PERMISSIVE policies of the same type.

## Full Schema Dump

```
| schemaname | tablename   | policyname                               | permissive | roles    | cmd    | qual                                                                                                                               |
| ---------- | ----------- | ---------------------------------------- | ---------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| public     | notes       | Users can delete own notes               | PERMISSIVE | {public} | DELETE | (owner_id = auth.uid())                                                                                                            |
| public     | notes       | Users can insert own notes               | PERMISSIVE | {public} | INSERT | null                                                                                                                               |
| public     | notes       | Users can update own notes               | PERMISSIVE | {public} | UPDATE | (owner_id = auth.uid())                                                                                                            |
| public     | notes       | Users can view own notes                 | PERMISSIVE | {public} | SELECT | (owner_id = auth.uid())                                                                                                            |
| public     | notes       | notes_owner_all                          | PERMISSIVE | {public} | ALL    | (owner_id = auth.uid())                                                                                                            |
| public     | notes       | notes_owner_delete                       | PERMISSIVE | {public} | DELETE | ((owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM spaces s WHERE ((s.id = notes.space_id) AND (s.owner_id = auth.uid())))))    |
| public     | notes       | notes_owner_insert                       | PERMISSIVE | {public} | INSERT | null                                                                                                                               |
| public     | notes       | notes_owner_select                       | PERMISSIVE | {public} | SELECT | ((owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM spaces s WHERE ((s.id = notes.space_id) AND (s.owner_id = auth.uid())))))    |
| public     | notes       | notes_owner_update                       | PERMISSIVE | {public} | UPDATE | ((owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM spaces s WHERE ((s.id = notes.space_id) AND (s.owner_id = auth.uid())))))    |
| public     | recall_bots | Service role can manage all bot mappings | PERMISSIVE | {public} | ALL    | ((auth.jwt() ->> 'role'::text) = 'service_role'::text)                                                                            |
| public     | recall_bots | Users can view own bot mappings          | PERMISSIVE | {public} | SELECT | (user_id = auth.uid())                                                                                                             |
| public     | recall_bots | recall_bots_owner_delete                 | PERMISSIVE | {public} | DELETE | (user_id = auth.uid())                                                                                                             |
| public     | recall_bots | recall_bots_owner_insert                 | PERMISSIVE | {public} | INSERT | null                                                                                                                               |
| public     | recall_bots | recall_bots_owner_select                 | PERMISSIVE | {public} | SELECT | (user_id = auth.uid())                                                                                                             |
| public     | recall_bots | recall_bots_owner_update                 | PERMISSIVE | {public} | UPDATE | (user_id = auth.uid())                                                                                                             |
| public     | spaces      | Users can delete own spaces              | PERMISSIVE | {public} | DELETE | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | Users can insert own spaces              | PERMISSIVE | {public} | INSERT | null                                                                                                                               |
| public     | spaces      | Users can update own spaces              | PERMISSIVE | {public} | UPDATE | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | Users can view own spaces                | PERMISSIVE | {public} | SELECT | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | spaces_owner_all                         | PERMISSIVE | {public} | ALL    | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | spaces_owner_delete                      | PERMISSIVE | {public} | DELETE | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | spaces_owner_insert                      | PERMISSIVE | {public} | INSERT | null                                                                                                                               |
| public     | spaces      | spaces_owner_select                      | PERMISSIVE | {public} | SELECT | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | spaces_owner_update                      | PERMISSIVE | {public} | UPDATE | (owner_id = auth.uid())                                                                                                            |
| public     | spaces      | spaces_shared_read                       | PERMISSIVE | {public} | SELECT | (visibility = 'shared'::text)                                                                                                      |
| public     | spaces      | spaces_shared_select                     | PERMISSIVE | {public} | SELECT | (visibility = 'shared'::text)                                                                                                      |
| public     | spaces      | spaces_team_select                       | PERMISSIVE | {public} | SELECT | (visibility = 'team'::text)                                                                                                        |
```