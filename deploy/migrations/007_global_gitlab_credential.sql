-- 007_global_gitlab_credential.sql
-- Add partial unique index for env-based global GitLab credentials (user_id IS NULL).
-- Migration 002 removed the simple UNIQUE on gitlab_url; for anonymous/system rows
-- we need a separate partial index so UpsertGitLabCredentialByURL can use ON CONFLICT.

CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_creds_global_url
    ON gitlab_credentials(gitlab_url)
    WHERE user_id IS NULL;
