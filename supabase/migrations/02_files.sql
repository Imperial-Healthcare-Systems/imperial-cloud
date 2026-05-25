-- =============================================================================
-- IMPERIAL CLOUD — 02: FILES, FOLDERS, VERSIONS
-- =============================================================================
-- Folder hierarchy uses the MATERIALIZED PATH pattern (ltree-style text path)
-- plus parent_id. This gives O(1) ancestor queries (path LIKE prefix) without
-- recursive CTEs for the common case, while parent_id preserves referential
-- integrity. Both are kept consistent by triggers in 04_functions.sql.
-- =============================================================================

-- =============================================================================
-- FOLDERS
-- =============================================================================
create table folders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null check (length(name) between 1 and 255),
  parent_id       uuid references folders(id) on delete cascade,
  owner_id        uuid not null references profiles(id) on delete restrict,
  -- materialized path of ancestor ids, e.g. 'root.<uuid>.<uuid>'. Maintained
  -- by trigger. Enables: descendants via (path LIKE folder.path || '%').
  path            text not null default '',
  depth           smallint not null default 0,
  is_trashed      boolean not null default false,
  trashed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- no two sibling folders share a name within an org (case-insensitive)
  unique (org_id, parent_id, name)
);

-- =============================================================================
-- FILES — the logical file. Bytes live in Storage; this is the metadata row.
-- The CURRENT version's data is denormalized here for fast listing; full
-- history lives in file_versions.
-- =============================================================================
create table files (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  folder_id       uuid references folders(id) on delete set null,
  owner_id        uuid not null references profiles(id) on delete restrict,
  name            text not null check (length(name) between 1 and 255),
  -- current version pointer (set after first version row is created)
  current_version_id uuid,  -- FK added after file_versions exists (deferred)
  mime_type       text,
  -- denormalized from current version for list queries
  size_bytes      bigint not null default 0,
  checksum_sha256 text,
  -- full-text search vector over name + extracted text (maintained by trigger)
  search_tsv      tsvector,
  is_starred      boolean not null default false,
  is_trashed      boolean not null default false,
  trashed_at      timestamptz,
  download_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, folder_id, name)
);

-- =============================================================================
-- FILE VERSIONS — immutable. Every upload to an existing file appends a row.
-- Rollback = set files.current_version_id to an older row (never deletes).
-- =============================================================================
create table file_versions (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references files(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  version_number  integer not null,   -- monotonically increasing per file
  -- physical object key in the Storage bucket. Each version is a distinct
  -- object so old bytes are preserved on update.
  storage_path    text not null unique,
  size_bytes      bigint not null,
  mime_type       text,
  checksum_sha256 text,
  scan_status     file_scan_status not null default 'pending',
  uploaded_by     uuid not null references profiles(id) on delete restrict,
  -- optional human note ("replaced cover image")
  change_note     text,
  created_at      timestamptz not null default now(),
  unique (file_id, version_number)
);

-- Immutability guard: file_versions rows may never be updated or deleted
-- except scan_status (set once by the scanner). Enforced by trigger in 04.

-- now wire the deferred FK from files → current version
alter table files
  add constraint files_current_version_fk
  foreign key (current_version_id) references file_versions(id)
  on delete set null
  deferrable initially deferred;

-- =============================================================================
-- FILE METADATA & TAGS
-- =============================================================================
-- Extracted metadata (EXIF, page count, duration…) as flexible KV.
create table file_metadata (
  file_id         uuid primary key references files(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  -- extracted searchable text (PDF/Office body) feeds files.search_tsv
  extracted_text  text,
  -- arbitrary structured metadata
  attributes      jsonb not null default '{}'::jsonb,
  -- preview/thumbnail object keys generated by a background job
  thumbnail_path  text,
  preview_path    text,
  updated_at      timestamptz not null default now()
);

create table file_tags (
  file_id         uuid not null references files(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  tag             text not null check (length(tag) between 1 and 40),
  primary key (file_id, tag)
);

-- =============================================================================
-- INDEXES — tuned for the hot paths (listing a folder, search, traversal)
-- =============================================================================
-- List a folder's live contents, newest first
create index idx_files_folder_live on files(org_id, folder_id, created_at desc)
  where not is_trashed;
create index idx_folders_parent_live on folders(org_id, parent_id)
  where not is_trashed;
create index idx_files_owner on files(owner_id);

-- Folder subtree queries: descendants by path prefix
create index idx_folders_path on folders using btree (org_id, path text_pattern_ops);

-- Full-text + fuzzy filename search
create index idx_files_search_tsv on files using gin (search_tsv);
create index idx_files_name_trgm on files using gin (name gin_trgm_ops);
create index idx_file_tags_tag on file_tags using btree (org_id, tag);

-- Version history lookups
create index idx_versions_file on file_versions(file_id, version_number desc);
create index idx_versions_scan_pending on file_versions(scan_status)
  where scan_status = 'pending';

-- Trash views
create index idx_files_trash on files(org_id, trashed_at) where is_trashed;

comment on table file_versions is 'Immutable. Append on update; rollback repoints files.current_version_id.';
comment on column files.search_tsv is 'tsvector over name + extracted_text; maintained by trigger.';
comment on column folders.path is 'Materialized ancestor path for O(1) subtree queries via prefix match.';
