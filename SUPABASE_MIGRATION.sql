-- Supabase SQL Migration for Meeting Notes Metadata Support
-- Run this in your Supabase SQL Editor

-- 1. Add metadata column to notes table if it doesn't exist
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Create index for better performance on metadata queries
CREATE INDEX IF NOT EXISTS idx_notes_metadata ON notes USING GIN (metadata);

-- 3. Add comment to explain the metadata structure
COMMENT ON COLUMN notes.metadata IS 'Stores meeting-specific data: edited_title, participants, last_edited, participants_updated, summary_generated_at';

-- 4. Update RLS policies to allow metadata updates (if you have RLS enabled)
-- Assuming you have RLS enabled, adjust based on your setup
-- This allows authenticated users to update their own notes including metadata
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can update own notes') THEN
        DROP POLICY "Users can update own notes" ON notes;
    END IF;
END $$;

CREATE POLICY "Users can update own notes" ON notes
    FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Sample metadata structure for reference:
-- {
--   "edited_title": "Team Standup Meeting",
--   "participants": ["John Doe", "Jane Smith", "Bob Johnson"],
--   "last_edited": "2024-01-15T10:30:00Z",
--   "participants_updated": "2024-01-15T10:31:00Z",
--   "summary_generated_at": "2024-01-15T10:35:00Z"
-- }

-- 6. Optional: Migrate existing notes to have empty metadata
UPDATE notes 
SET metadata = '{}'::jsonb 
WHERE metadata IS NULL;

-- 7. Create a function to safely update metadata (preserves existing fields)
CREATE OR REPLACE FUNCTION update_note_metadata(
    note_id UUID,
    new_metadata JSONB
)
RETURNS VOID AS $$
BEGIN
    UPDATE notes 
    SET metadata = metadata || new_metadata
    WHERE id = note_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON notes TO authenticated;
GRANT EXECUTE ON FUNCTION update_note_metadata TO authenticated;

-- 9. Multi-tenant isolation for Meetings and Notes
-- Add owner_id to spaces and notes, create recall_bots mapping table, and enable RLS

-- Add owner_id columns
ALTER TABLE IF EXISTS spaces ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE IF EXISTS notes ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Mapping table for Recall bots → users
CREATE TABLE IF NOT EXISTS recall_bots (
  bot_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  meeting_url TEXT,
  status TEXT,
  transcript_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_spaces_owner ON spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_space ON notes(space_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_id);
CREATE INDEX IF NOT EXISTS idx_recall_bots_user ON recall_bots(user_id);

-- Enable RLS
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_bots ENABLE ROW LEVEL SECURITY;

-- Spaces policies: owners only
DROP POLICY IF EXISTS spaces_owner_select ON spaces;
DROP POLICY IF EXISTS spaces_owner_insert ON spaces;
DROP POLICY IF EXISTS spaces_owner_update ON spaces;
DROP POLICY IF EXISTS spaces_owner_delete ON spaces;

CREATE POLICY spaces_owner_select ON spaces
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY spaces_owner_insert ON spaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY spaces_owner_update ON spaces
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY spaces_owner_delete ON spaces
  FOR DELETE USING (owner_id = auth.uid());

-- Notes policies: owner of the note and space
DROP POLICY IF EXISTS notes_owner_select ON notes;
DROP POLICY IF EXISTS notes_owner_insert ON notes;
DROP POLICY IF EXISTS notes_owner_update ON notes;
DROP POLICY IF EXISTS notes_owner_delete ON notes;

CREATE POLICY notes_owner_select ON notes
  FOR SELECT USING (
    owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM spaces s WHERE s.id = notes.space_id AND s.owner_id = auth.uid()
    )
  );
CREATE POLICY notes_owner_insert ON notes
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND EXISTS (
      SELECT 1 FROM spaces s WHERE s.id = notes.space_id AND s.owner_id = auth.uid()
    )
  );
CREATE POLICY notes_owner_update ON notes
  FOR UPDATE USING (
    owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM spaces s WHERE s.id = notes.space_id AND s.owner_id = auth.uid()
    )
  ) WITH CHECK (
    owner_id = auth.uid()
  );
CREATE POLICY notes_owner_delete ON notes
  FOR DELETE USING (
    owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM spaces s WHERE s.id = notes.space_id AND s.owner_id = auth.uid()
    )
  );

-- Recall bots policies: owners can read their mappings; writes are typically from service role
DROP POLICY IF EXISTS recall_bots_owner_select ON recall_bots;
DROP POLICY IF EXISTS recall_bots_owner_insert ON recall_bots;
DROP POLICY IF EXISTS recall_bots_owner_update ON recall_bots;
DROP POLICY IF EXISTS recall_bots_owner_delete ON recall_bots;

CREATE POLICY recall_bots_owner_select ON recall_bots
  FOR SELECT USING (user_id = auth.uid());
-- Optional: allow users to insert their own mappings if created from client
CREATE POLICY recall_bots_owner_insert ON recall_bots
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY recall_bots_owner_update ON recall_bots
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY recall_bots_owner_delete ON recall_bots
  FOR DELETE USING (user_id = auth.uid());