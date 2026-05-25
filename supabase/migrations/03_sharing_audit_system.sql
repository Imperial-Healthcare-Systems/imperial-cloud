-- =============================================================================
-- IMPERIAL CLOUD — 03: SHARING, AUDIT, NOTIFICATIONS, SESSIONS, ANALYTICS
-- =============================================================================

-- =============================================================================
-- SHARING — internal (member ↔ member) and external (signed links)
-- =============================================================================
-- Direct share of a file or folder to another org member.
create table shares (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  file_id         uuid references files(id) on delete cascade,
  folder_id       uuid references folders(id) on delete cascade,
  shared_by       uuid not null references profiles(id) on delete cascade,
  shared_with     uuid not null references profiles(id) on delete cascade,
  permission      share_permission not null default 'view',
  created_at      timestamptz not null default now(),
  -- exactly one of file_id / folder_id must be set
  constraint share_one_target check (
    (file_id is not null and folder_id is null) or
    (file_id is null and folder_id is not null)
  ),
  unique (file_id, folder_id, shared_with)
);

-- Public/tokenized share links (external access without an account).
create table shared_links (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  file_id         uuid references files(id) on delete cascade,
  folder_id       uuid references folders(id) on delete cascade,
  created_by      uuid not null references profiles(id) on delete cascade,
  -- opaque high-entropy token used in the public URL; store only a hash
  token_hash      text not null unique,
  permission      share_permission not null default 'view',
  status          share_link_status not null default 'active',
  -- optional password gate (hash) and limits
  password_hash   text,
  max_downloads   integer,
  download_count  integer not null default 0,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint link_one_target check (
    (file_id is not null and folder_id is null) or
    (file_id is null and folder_id is not null)
  )
);

-- =============================================================================
-- ACTIVITY LOG — user-facing feed (mutable views, can be pruned)
-- =============================================================================
create table activity_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  actor_id        uuid references profiles(id) on delete set null,
  action          activity_action not null,
  -- polymorphic target (file/folder/member…), kept loose for the feed
  target_type     text,
  target_id       uuid,
  target_name     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- AUDIT LOG — IMMUTABLE, security-grade. Append-only; never updated/deleted.
-- Separate from activity_logs so retention/compliance rules differ.
-- =============================================================================
create table audit_logs (
  id              bigint generated always as identity primary key,
  org_id          uuid references organizations(id) on delete set null,
  actor_id        uuid references profiles(id) on delete set null,
  action          activity_action not null,
  target_type     text,
  target_id       uuid,
  -- security context captured at write time
  ip_address      inet,
  user_agent      text,
  -- tamper-evidence: hash chain over prior row (set by trigger)
  prev_hash       text,
  row_hash        text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  recipient_id    uuid not null references profiles(id) on delete cascade,
  kind            notification_kind not null,
  title           text not null,
  body            text,
  -- deep-link target
  target_type     text,
  target_id       uuid,
  is_read         boolean not null default false,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- SESSIONS & DEVICES — augment Supabase auth.sessions with our tracking
-- =============================================================================
create table user_devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  device_label    text,              -- "MacBook Pro · Chrome"
  user_agent      text,
  last_ip         inet,
  last_seen_at    timestamptz default now(),
  is_trusted      boolean not null default false,
  created_at      timestamptz not null default now()
);

create table login_history (
  id              bigint generated always as identity primary key,
  user_id         uuid references profiles(id) on delete set null,
  email_attempted text,
  success         boolean not null,
  failure_reason  text,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- ANALYTICS — pre-aggregated rollups (populated by background jobs)
-- =============================================================================
create table storage_analytics (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references organizations(id) on delete cascade,
  -- daily snapshot
  day             date not null,
  total_bytes     bigint not null default 0,
  file_count      integer not null default 0,
  unique (org_id, day)
);

create table upload_analytics (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references organizations(id) on delete cascade,
  day             date not null,
  upload_count    integer not null default 0,
  bytes_uploaded  bigint not null default 0,
  unique (org_id, day)
);

create table user_activity_stats (
  org_id          uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  day             date not null,
  actions         integer not null default 0,
  primary key (org_id, user_id, day)
);

-- =============================================================================
-- SYSTEM — settings, feature flags, API keys, webhooks
-- =============================================================================
create table app_settings (
  key             text primary key,
  value           jsonb not null,
  updated_at      timestamptz not null default now()
);

create table feature_flags (
  key             text primary key,
  enabled         boolean not null default false,
  -- optional per-org targeting; empty = global
  org_overrides   jsonb not null default '{}'::jsonb,
  description     text
);

create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  created_by      uuid not null references profiles(id) on delete cascade,
  label           text not null,
  -- store only a hash of the key; show prefix for identification
  key_prefix      text not null,
  key_hash        text not null unique,
  scopes          permission_key[] not null default '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table webhooks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  url             text not null,
  -- events to deliver, e.g. {'file.upload','share.create'}
  events          text[] not null default '{}',
  secret          text not null,          -- HMAC signing secret
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
create index idx_shares_with on shares(shared_with);
create index idx_shares_file on shares(file_id);
create index idx_shares_folder on shares(folder_id);
create index idx_shared_links_token on shared_links(token_hash) where status = 'active';
create index idx_activity_org_time on activity_logs(org_id, created_at desc);
create index idx_activity_actor on activity_logs(actor_id, created_at desc);
create index idx_audit_org_time on audit_logs(org_id, created_at desc);
create index idx_audit_actor on audit_logs(actor_id, created_at desc);
create index idx_notif_recipient_unread on notifications(recipient_id, created_at desc)
  where not is_read;
create index idx_devices_user on user_devices(user_id);
create index idx_login_history_user on login_history(user_id, created_at desc);
create index idx_api_keys_org on api_keys(org_id) where revoked_at is null;

comment on table audit_logs is 'Immutable, append-only, hash-chained. Compliance-grade; never mutated.';
comment on table shared_links is 'External tokenized access. Store only token_hash; optional password/expiry/limits.';
comment on column audit_logs.row_hash is 'SHA-256 over (prev_hash + row fields); enables tamper detection.';
