-- Add segments column for interleaved tool-call rendering (ContentSegment[])
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS segments JSONB;
