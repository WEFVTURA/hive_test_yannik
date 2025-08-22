-- Table to track which user sent a bot to which meeting URL
CREATE TABLE IF NOT EXISTS meeting_urls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookups
CREATE INDEX idx_meeting_urls_url ON meeting_urls(url);
CREATE INDEX idx_meeting_urls_user ON meeting_urls(user_id);
CREATE INDEX idx_meeting_urls_created ON meeting_urls(created_at DESC);

-- Add meeting_url column to recall_bots if not exists
ALTER TABLE recall_bots 
ADD COLUMN IF NOT EXISTS meeting_url TEXT;

-- Index for meeting URL lookups
CREATE INDEX IF NOT EXISTS idx_recall_bots_meeting_url ON recall_bots(meeting_url);