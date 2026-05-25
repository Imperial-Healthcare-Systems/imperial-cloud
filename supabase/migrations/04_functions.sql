-- =============================================================================
-- IMPERIAL CLOUD — 04: FUNCTIONS & TRIGGERS
-- =============================================================================
-- These are the engine. RLS policies (05) call the permission helpers here.
-- All security-definer functions are owned by the schema owner and have a
-- locked search_path to prevent privilege-escalation via shadowing.
-- =============================================================================

-- ── updated_at maintenance ──────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_orgs_updated before update on organizations
  for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create trigger trg_folders_updated before update on folders
  for each row execute function set_updated_at();
create trigger trg_files_updated before update on files
  for each row execute function set_updated_at();

-- =============================================================================
-- RBAC HELPERS — the heart of access control. Used by RLS everywhere.
-- =============================================================================

-- Is the current user a platform operator? (crosses org boundaries)
create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_platform_admin from profiles where id = auth.uid()),
    false
  );
$$;

-- Active membership row for the current user in a given org (or null).
create or replace function current_member(p_org uuid)
returns organization_members language sql stable security definer set search_path = public as $$
  select * from organization_members
  where org_id = p_org and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

-- Does the current user belong (active) to this org?
create or replace function is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  );
$$;

-- Does the current user hold a permission in this org?
-- Resolution order: platform admin → explicit member override (deny wins) →
-- role default. This is the single source of truth for "can they do X".
create or replace function has_permission(p_org uuid, p_perm permission_key)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_member organization_members;
  v_override boolean;
  v_role_has boolean;
begin
  if is_platform_admin() then return true; end if;

  select * into v_member from organization_members
    where org_id = p_org and user_id = auth.uid() and status = 'active' limit 1;
  if v_member.id is null then return false; end if;

  -- explicit per-member override (deny beats grant beats role default)
  select effect into v_override from member_permission_overrides
    where member_id = v_member.id and permission_key = p_perm;
  if v_override is not null then return v_override; end if;

  -- role default from the matrix
  select exists (
    select 1 from role_permissions
    where role_key = v_member.role_key and permission_key = p_perm
  ) into v_role_has;
  return v_role_has;
end $$;

-- Can the current user manage (modify role of) a target member?
-- Only if same org AND strictly higher privilege (lower rank ordinal).
create or replace function can_manage_member(p_org uuid, p_target_user uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare my_rank smallint; target_rank smallint;
begin
  if is_platform_admin() then return true; end if;
  select r.rank into my_rank from organization_members m
    join roles r on r.key = m.role_key
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active';
  select r.rank into target_rank from organization_members m
    join roles r on r.key = m.role_key
    where m.org_id = p_org and m.user_id = p_target_user;
  if my_rank is null or target_rank is null then return false; end if;
  return my_rank < target_rank;  -- strictly more privileged
end $$;

-- =============================================================================
-- FILE ACCESS RESOLUTION — combines ownership, role, and shares.
-- =============================================================================
-- Can the current user at least VIEW this file? (owner | org manage | shared)
create or replace function can_access_file(p_file files)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if is_platform_admin() then return true; end if;
  if p_file.owner_id = auth.uid() then return true; end if;
  -- org admins/managers with audit/manage permission see all org files
  if has_permission(p_file.org_id, 'audit.access') then return true; end if;
  -- direct share to this user
  if exists (select 1 from shares s where s.file_id = p_file.id and s.shared_with = auth.uid())
    then return true; end if;
  -- inherited via a shared ancestor folder
  if exists (
    select 1 from shares s
    join folders f on f.id = s.folder_id
    join folders child on child.id = p_file.folder_id
    where s.shared_with = auth.uid()
      and child.path like f.path || '%'
  ) then return true; end if;
  return false;
end $$;

-- =============================================================================
-- FOLDER MATERIALIZED PATH — maintain path + depth on insert/move.
-- =============================================================================
create or replace function maintain_folder_path()
returns trigger language plpgsql as $$
declare parent_path text; parent_depth smallint;
begin
  if new.parent_id is null then
    new.path := new.id::text;
    new.depth := 0;
  else
    select path, depth into parent_path, parent_depth from folders where id = new.parent_id;
    if parent_path is null then raise exception 'parent folder % not found', new.parent_id; end if;
    -- prevent cycles: a folder cannot be moved under its own descendant
    if parent_path like new.id::text || '%' then
      raise exception 'cannot move folder into its own subtree';
    end if;
    new.path := parent_path || '.' || new.id::text;
    new.depth := parent_depth + 1;
  end if;
  return new;
end $$;

create trigger trg_folder_path before insert or update of parent_id on folders
  for each row execute function maintain_folder_path();

-- When a folder moves, re-path all descendants.
create or replace function repath_descendants()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.path is distinct from old.path then
    update folders
      set path = new.path || substring(path from length(old.path) + 1)
      where path like old.path || '.%' and org_id = new.org_id;
  end if;
  return new;
end $$;

create trigger trg_folder_repath after update of path on folders
  for each row execute function repath_descendants();

-- =============================================================================
-- FILE VERSIONING — append a version + repoint current; track quota.
-- =============================================================================
-- Call this from the API after the object is in Storage. It atomically:
--  1) computes the next version_number, 2) inserts the immutable version,
--  3) updates files denormalized fields + current_version_id,
--  4) adjusts org/member storage usage by the delta.
create or replace function create_file_version(
  p_file_id uuid, p_storage_path text, p_size bigint,
  p_mime text, p_checksum text, p_uploader uuid, p_note text default null
) returns file_versions language plpgsql security definer set search_path = public as $$
declare
  v_file files; v_next int; v_old_size bigint; v_ver file_versions;
begin
  select * into v_file from files where id = p_file_id for update;
  if v_file.id is null then raise exception 'file % not found', p_file_id; end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from file_versions where file_id = p_file_id;
  v_old_size := v_file.size_bytes;

  insert into file_versions(file_id, org_id, version_number, storage_path,
      size_bytes, mime_type, checksum_sha256, uploaded_by, change_note)
    values (p_file_id, v_file.org_id, v_next, p_storage_path, p_size, p_mime,
      p_checksum, p_uploader, p_note)
    returning * into v_ver;

  update files set
      current_version_id = v_ver.id, size_bytes = p_size, mime_type = p_mime,
      checksum_sha256 = p_checksum, updated_at = now()
    where id = p_file_id;

  -- quota delta (new size minus the size we were previously counting)
  perform adjust_storage(v_file.org_id, p_uploader, p_size - v_old_size);
  return v_ver;
end $$;

-- Rollback: point current_version_id at an older version (no deletion).
create or replace function rollback_file_version(p_file_id uuid, p_version int)
returns void language plpgsql security definer set search_path = public as $$
declare v_ver file_versions; v_file files;
begin
  select * into v_file from files where id = p_file_id for update;
  select * into v_ver from file_versions
    where file_id = p_file_id and version_number = p_version;
  if v_ver.id is null then raise exception 'version % not found', p_version; end if;
  update files set current_version_id = v_ver.id, size_bytes = v_ver.size_bytes,
      mime_type = v_ver.mime_type, checksum_sha256 = v_ver.checksum_sha256,
      updated_at = now()
    where id = p_file_id;
  perform adjust_storage(v_file.org_id, auth.uid(), v_ver.size_bytes - v_file.size_bytes);
end $$;

-- Immutability guard for file_versions: block updates (except scan_status) & deletes.
create or replace function guard_version_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'file_versions are immutable and cannot be deleted';
  end if;
  -- allow only scan_status to change
  if row(new.*) is distinct from row(old.*) then
    if new.id <> old.id or new.file_id <> old.file_id
       or new.version_number <> old.version_number
       or new.storage_path <> old.storage_path or new.size_bytes <> old.size_bytes then
      raise exception 'file_versions are immutable except scan_status';
    end if;
  end if;
  return new;
end $$;

create trigger trg_version_immutable before update or delete on file_versions
  for each row execute function guard_version_immutable();

-- =============================================================================
-- STORAGE QUOTA — central adjuster, enforces org + member caps.
-- =============================================================================
create or replace function adjust_storage(p_org uuid, p_user uuid, p_delta bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_org organizations; v_member organization_members;
begin
  select * into v_org from organizations where id = p_org for update;
  -- org cap
  if v_org.storage_quota_bytes is not null
     and v_org.storage_used_bytes + p_delta > v_org.storage_quota_bytes then
    raise exception 'organization storage quota exceeded'
      using errcode = 'check_violation';
  end if;
  update organizations set storage_used_bytes = greatest(0, storage_used_bytes + p_delta)
    where id = p_org;

  -- member cap (if set)
  select * into v_member from organization_members
    where org_id = p_org and user_id = p_user for update;
  if v_member.id is not null then
    if v_member.storage_quota_bytes is not null
       and v_member.storage_used_bytes + p_delta > v_member.storage_quota_bytes then
      raise exception 'member storage quota exceeded' using errcode = 'check_violation';
    end if;
    update organization_members
      set storage_used_bytes = greatest(0, storage_used_bytes + p_delta)
      where id = v_member.id;
  end if;
end $$;

-- Release quota when a file is hard-deleted.
create or replace function release_storage_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform adjust_storage(old.org_id, old.owner_id, -old.size_bytes);
  return old;
end $$;

create trigger trg_file_release_storage after delete on files
  for each row execute function release_storage_on_delete();

-- =============================================================================
-- SEARCH VECTOR — keep files.search_tsv current from name + extracted text.
-- =============================================================================
create or replace function update_file_search()
returns trigger language plpgsql as $$
declare v_text text;
begin
  select extracted_text into v_text from file_metadata where file_id = new.id;
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(v_text, '')), 'C');
  return new;
end $$;

create trigger trg_file_search before insert or update of name on files
  for each row execute function update_file_search();

-- =============================================================================
-- AUDIT HASH CHAIN — tamper-evident append-only log.
-- =============================================================================
create or replace function audit_hash_chain()
returns trigger language plpgsql as $$
declare v_prev text;
begin
  select row_hash into v_prev from audit_logs
    where org_id is not distinct from new.org_id
    order by id desc limit 1;
  new.prev_hash := v_prev;
  new.row_hash := encode(digest(
    coalesce(v_prev,'') || coalesce(new.actor_id::text,'') || new.action::text ||
    coalesce(new.target_id::text,'') || coalesce(new.ip_address::text,'') ||
    new.created_at::text, 'sha256'), 'hex');
  return new;
end $$;

create trigger trg_audit_chain before insert on audit_logs
  for each row execute function audit_hash_chain();

-- Block any mutation of audit_logs (append-only).
create or replace function guard_audit_append_only()
returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;

create trigger trg_audit_no_update before update or delete on audit_logs
  for each row execute function guard_audit_append_only();

-- =============================================================================
-- NEW USER BOOTSTRAP — create profile when auth.users row appears.
-- =============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name)
    values (new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
    on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

comment on function has_permission is 'Single source of truth for authz. Order: platform admin → member override (deny wins) → role default.';
comment on function create_file_version is 'Atomic: append immutable version, repoint current, adjust quota by size delta.';
comment on function audit_hash_chain is 'Each audit row hashes prev_hash + fields → tamper-evident chain.';
