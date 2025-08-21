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