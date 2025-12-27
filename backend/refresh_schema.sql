-- Refresh Supabase Schema Cache
-- Run this after adding the image_url column

-- This will trigger a schema refresh
NOTIFY pgrst, 'reload schema';
