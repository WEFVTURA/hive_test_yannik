-- Backfill Script for User Data Isolation
-- Run this in Supabase SQL Editor to complete the isolation setup

-- ============================================
-- STEP 1: Identify and map existing users
-- ============================================

-- First, let's see what users we have
SELECT DISTINCT email, id, created_at
FROM auth.users 
ORDER BY created_at;

-- ============================================
-- STEP 2: Backfill owner_id for spaces
-- ============================================

-- For spaces without owner_id, assign to a specific user
-- Replace 'YOUR_USER_ID' with actual UUID from Step 1
-- Example: UPDATE spaces SET owner_id = '123e4567-e89b-12d3-a456-426614174000' WHERE name = 'Meetings' AND owner_id IS NULL;

-- If you have a single user, assign all orphaned spaces to them:
UPDATE spaces 
SET owner_id = (SELECT id FROM auth.users WHERE email = 'ggg@fvtura.com' LIMIT 1)
WHERE owner_id IS NULL;

-- ============================================
-- STEP 3: Backfill owner_id for notes
-- ============================================

-- Assign orphaned notes to their space owners
UPDATE notes n
SET owner_id = s.owner_id
FROM spaces s
WHERE n.space_id = s.id
  AND n.owner_id IS NULL
  AND s.owner_id IS NOT NULL;

-- For notes without a space or with orphaned space, assign to specific user
UPDATE notes
SET owner_id = (SELECT id FROM auth.users WHERE email = 'ggg@fvtura.com' LIMIT 1)
WHERE owner_id IS NULL;

-- ============================================
-- STEP 4: Map existing Recall bots to users
-- ============================================

-- If you know which bots belong to which user, insert mappings
-- Replace with actual bot_id and user_id values

-- Example for a known bot:
-- INSERT INTO recall_bots (bot_id, user_id, created_at)
-- VALUES ('BOT_ID_HERE', 'USER_UUID_HERE', now())
-- ON CONFLICT (bot_id) DO UPDATE SET user_id = EXCLUDED.user_id;

-- If all existing bots belong to one user:
-- First, get list of bot IDs from existing notes
WITH existing_bots AS (
  SELECT DISTINCT 
    regexp_replace(title, '.*\[([a-f0-9\-]+)\].*', '\1') as bot_id
  FROM notes
  WHERE title ~ '\[[a-f0-9\-]+\]'
)
INSERT INTO recall_bots (bot_id, user_id, created_at)
SELECT 
  bot_id,
  (SELECT id FROM auth.users WHERE email = 'ggg@fvtura.com' LIMIT 1),
  now()
FROM existing_bots
WHERE bot_id IS NOT NULL
ON CONFLICT (bot_id) DO NOTHING;

-- ============================================
-- STEP 5: Verify the backfill
-- ============================================

-- Check for any remaining orphaned records
SELECT 'Orphaned spaces' as type, COUNT(*) as count FROM spaces WHERE owner_id IS NULL
UNION ALL
SELECT 'Orphaned notes' as type, COUNT(*) as count FROM notes WHERE owner_id IS NULL
UNION ALL
SELECT 'Total bot mappings' as type, COUNT(*) as count FROM recall_bots;

-- ============================================
-- STEP 6: Enable RLS (Row Level Security)
-- ============================================

-- Only run this after confirming backfill is complete!

-- Enable RLS on tables
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_bots ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view own spaces" ON spaces;
DROP POLICY IF EXISTS "Users can insert own spaces" ON spaces;
DROP POLICY IF EXISTS "Users can update own spaces" ON spaces;
DROP POLICY IF EXISTS "Users can delete own spaces" ON spaces;

DROP POLICY IF EXISTS "Users can view own notes" ON notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;

DROP POLICY IF EXISTS "Users can view own bot mappings" ON recall_bots;
DROP POLICY IF EXISTS "Service role can manage all bot mappings" ON recall_bots;

-- Create simple, clear policies for spaces
CREATE POLICY "Users can view own spaces" ON spaces
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own spaces" ON spaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own spaces" ON spaces
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own spaces" ON spaces
  FOR DELETE USING (owner_id = auth.uid());

-- Create simple, clear policies for notes
CREATE POLICY "Users can view own notes" ON notes
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own notes" ON notes
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own notes" ON notes
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own notes" ON notes
  FOR DELETE USING (owner_id = auth.uid());

-- Create policies for recall_bots
CREATE POLICY "Users can view own bot mappings" ON recall_bots
  FOR SELECT USING (user_id = auth.uid());

-- Allow service role to manage all bot mappings (for webhooks)
CREATE POLICY "Service role can manage all bot mappings" ON recall_bots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- STEP 7: Final verification
-- ============================================

-- Test that RLS is working by checking policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('spaces', 'notes', 'recall_bots')
ORDER BY tablename, policyname;

-- ============================================
-- IMPORTANT NOTES:
-- ============================================
-- 1. Replace 'ggg@fvtura.com' with the actual user email
-- 2. Run sections 1-5 first to backfill data
-- 3. Verify no orphaned records remain
-- 4. Only then run section 6 to enable RLS
-- 5. Test with different user accounts to ensure isolation works