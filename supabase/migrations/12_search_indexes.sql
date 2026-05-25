-- =============================================================================
-- IMPERIAL CLOUD — 12: SEARCH INDEXES (folders + people)
-- =============================================================================
-- The existing files index (idx_files_name_trgm) covers file-name search.
-- The new ⌘K palette also searches folders and people, so we add matching
-- trigram indexes. Trigrams give us fast ILIKE '%foo%' lookups with typo
-- tolerance via the `%` operator — same approach the file FTS already uses.
-- =============================================================================

create index if not exists idx_folders_name_trgm
  on folders using gin (name gin_trgm_ops);

create index if not exists idx_profiles_full_name_trgm
  on profiles using gin (full_name gin_trgm_ops);

create index if not exists idx_profiles_email_trgm
  on profiles using gin (email gin_trgm_ops);

comment on index idx_folders_name_trgm is
  'Trigram index for fuzzy folder-name search in the global command palette.';
