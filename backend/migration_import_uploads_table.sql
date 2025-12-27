-- Additional table for tracking import uploads
-- This table stores metadata about uploaded files

CREATE TABLE IF NOT EXISTS import_uploads (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    total_plays INTEGER NOT NULL DEFAULT 0,
    inserted_plays INTEGER NOT NULL DEFAULT 0,
    upload_status TEXT NOT NULL DEFAULT 'processing' -- processing, completed, failed
        CHECK (upload_status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Unique constraint to prevent duplicate uploads
    UNIQUE(user_id, file_hash)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_import_uploads_user_id 
ON import_uploads(user_id);

CREATE INDEX IF NOT EXISTS idx_import_uploads_uploaded_at 
ON import_uploads(uploaded_at DESC);

-- Add comment for documentation
COMMENT ON TABLE import_uploads IS 'Tracks metadata of Spotify streaming history file uploads';
COMMENT ON COLUMN import_uploads.file_hash IS 'MD5 hash of the uploaded file content';
COMMENT ON COLUMN import_uploads.upload_status IS 'Current status of the import process';
COMMENT ON COLUMN import_uploads.error_message IS 'Error message if import failed';
