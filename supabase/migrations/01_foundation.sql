-- =============================================================================
-- IMPERIAL CLOUD — 01: FOUNDATION (extensions, enums, orgs, RBAC)
-- PostgreSQL 15+ / Supabase
-- =============================================================================
-- Run order: 01 → 02 → 03 → 04 (functions) → 05 (RLS) → 06 (seed)
-- Multi-tenant model: every row of business data belongs to an organization.
-- Isolation between orgs is enforced at the RLS layer, not the app layer.
-- =============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";      -- gen_random_uuid, digest
create extension if not exists "pg_trgm";        -- trigram fuzzy search
create extension if not exists "btree_gin";      -- composite GIN indexes

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Roles are ordered by privilege. Lower ordinal = higher privilege.
create type role_key as enum (
  'super_admin',     -- platform operator, crosses org boundaries
  'org_admin',       -- full control within one org
  'manager',         -- manage team + content within org
  'employee',        -- create/upload/share own + team content
  'client',          -- limited external collaborator
  'guest'            -- view-only via explicit grants
);

create type permission_key as enum (
  'file.create', 'file.upload', 'file.download', 'file.edit', 'file.delete',
  'file.share', 'folder.create', 'folder.edit', 'folder.delete',
  'user.invite', 'user.manage', 'billing.manage', 'storage.manage',
  'audit.access', 'org.manage', 'settings.manage'
);

create type member_status as enum ('active', 'invited', 'suspended', 'removed');
create type share_permission as enum ('view', 'comment', 'edit');
create type share_link_status as enum ('active', 'revoked', 'expired');
create type notification_kind as enum ('system', 'activity', 'collaboration', 'security');
create type activity_action as enum (
  'login', 'logout', 'upload', 'download', 'preview', 'rename', 'move',
  'delete', 'restore', 'share', 'unshare', 'version.create', 'version.rollback',
  'permission.change', 'member.invite', 'member.remove', 'settings.change'
);
create type file_scan_status as enum ('pending', 'clean', 'infected', 'skipped', 'failed');

-- =============================================================================
-- ORGANIZATIONS — the tenant boundary
-- =============================================================================
create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  -- storage quota for the whole org, in bytes. NULL = unlimited (enterprise).
  storage_quota_bytes  bigint default 107374182400,  -- 100 GB default
  storage_used_bytes   bigint not null default 0,
  -- soft settings blob for org-wide config (branding, defaults)
  settings        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- PROFILES — extends auth.users (Supabase) 1:1
-- =============================================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text,
  avatar_url      text,
  -- a user can belong to many orgs; this is their last-active one for UX
  default_org_id  uuid references organizations(id) on delete set null,
  -- platform-level flag, distinct from org roles. Only true for operators.
  is_platform_admin boolean not null default false,
  -- MFA readiness: store enrollment state; actual factors live in auth.mfa_*
  mfa_enabled     boolean not null default false,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- RBAC — roles, permissions, and the permission matrix
-- =============================================================================
-- Roles are global definitions; a member is assigned a role *within an org*.
create table roles (
  key             role_key primary key,
  label           text not null,
  -- privilege rank: lower = more powerful. Used for "can manage" comparisons.
  rank            smallint not null unique
);

create table permissions (
  key             permission_key primary key,
  label           text not null,
  description     text
);

-- The matrix: which permissions each role holds by default.
create table role_permissions (
  role_key        role_key references roles(key) on delete cascade,
  permission_key  permission_key references permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- =============================================================================
-- ORGANIZATION MEMBERS — the join of user → org → role
-- =============================================================================
create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  role_key        role_key not null references roles(key),
  status          member_status not null default 'active',
  -- per-member storage quota override within the org (bytes). NULL = no cap.
  storage_quota_bytes bigint,
  storage_used_bytes  bigint not null default 0,
  invited_by      uuid references profiles(id) on delete set null,
  invited_at      timestamptz,
  joined_at       timestamptz default now(),
  created_at      timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Per-member permission *overrides* (grant or revoke beyond the role default).
-- effect = true grants, effect = false explicitly denies (deny wins).
create table member_permission_overrides (
  member_id       uuid not null references organization_members(id) on delete cascade,
  permission_key  permission_key not null references permissions(key) on delete cascade,
  effect          boolean not null,
  primary key (member_id, permission_key)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index idx_profiles_default_org on profiles(default_org_id);
create index idx_org_members_org on organization_members(org_id) where status = 'active';
create index idx_org_members_user on organization_members(user_id) where status = 'active';
create index idx_orgs_slug on organizations(slug) where is_active;

comment on table organizations is 'Tenant boundary. All business data is org-scoped; RLS enforces isolation.';
comment on table organization_members is 'User-org-role join. The unit RLS checks for access decisions.';
comment on column member_permission_overrides.effect is 'true=grant, false=deny. Deny always wins over role default.';
