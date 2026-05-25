-- =============================================================================
-- IMPERIAL CLOUD — 08: ORG BOOTSTRAP, INVITATIONS, STORAGE POLICIES
-- =============================================================================
-- Adds:
--   • create_organization() RPC — atomic org + org_admin member + set
--     default_org_id. Without this, a fresh signup has no workspace.
--   • org_invitations table — pending invites keyed by email so we can invite
--     users who don't have an account yet.
--   • promote_or_create_member() RPC — called on /auth/callback for new users
--     to consume any pending invites for their email.
--   • Storage bucket RLS policies for `imperial-files` (mirrors file RLS).
-- =============================================================================

-- ── Pending invitations (email-keyed; consumed on first sign-in) ────────────
create table if not exists org_invitations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  email           text not null,
  role_key        role_key not null default 'employee',
  invited_by      uuid not null references profiles(id) on delete cascade,
  token_hash      text not null unique,    -- hash of an opaque token if used in a link
  status          text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at      timestamptz default (now() + interval '14 days'),
  created_at      timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists idx_invites_email_pending
  on org_invitations(lower(email)) where status = 'pending';
create index if not exists idx_invites_org on org_invitations(org_id);

alter table org_invitations enable row level security;

-- Inviter or org admin reads; org admins create/update.
create policy invite_select on org_invitations for select
  using (invited_by = auth.uid() or has_permission(org_id, 'user.manage'));
create policy invite_insert on org_invitations for insert
  with check (has_permission(org_id, 'user.invite'));
create policy invite_update on org_invitations for update
  using (has_permission(org_id, 'user.manage'));
create policy invite_delete on org_invitations for delete
  using (has_permission(org_id, 'user.manage'));

-- =============================================================================
-- create_organization() — atomic workspace bootstrap.
-- =============================================================================
-- Why SECURITY DEFINER: the RLS WITH CHECK on organizations and members would
-- otherwise create a chicken-and-egg (org_admin can't insert until they ARE one).
-- We trust auth.uid() and do the necessary writes server-side.
create or replace function create_organization(
  p_name text, p_slug text
) returns organizations
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_org organizations;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;
  if p_slug !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'slug must be 2–40 chars: a-z, 0-9, dash';
  end if;

  -- Ensure a profiles row exists (the handle_new_user trigger normally does this,
  -- but in case of race or older accounts).
  insert into profiles(id, email)
    select id, email from auth.users where id = v_user
    on conflict (id) do nothing;

  insert into organizations(name, slug) values (trim(p_name), p_slug)
    returning * into v_org;

  insert into organization_members(org_id, user_id, role_key, status, joined_at)
    values (v_org.id, v_user, 'org_admin', 'active', now());

  update profiles set default_org_id = v_org.id where id = v_user;

  return v_org;
end $$;

comment on function create_organization is
  'Atomic: insert org, make caller org_admin member, set their default_org_id. SECURITY DEFINER (bypasses bootstrap chicken/egg).';

-- =============================================================================
-- consume_invitations() — promote a newly-signed-up user into any orgs
-- where their email had a pending invitation. Called on first /drive load.
-- =============================================================================
create or replace function consume_invitations()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_count int := 0;
  v_inv record;
begin
  if v_user is null then return 0; end if;
  select email into v_email from auth.users where id = v_user;
  if v_email is null then return 0; end if;

  for v_inv in
    select * from org_invitations
      where lower(email) = lower(v_email)
        and status = 'pending'
        and (expires_at is null or expires_at > now())
  loop
    insert into organization_members(org_id, user_id, role_key, status, joined_at, invited_by)
      values (v_inv.org_id, v_user, v_inv.role_key, 'active', now(), v_inv.invited_by)
      on conflict (org_id, user_id) do nothing;

    update org_invitations set status = 'accepted' where id = v_inv.id;
    v_count := v_count + 1;

    -- if user has no default org yet, adopt this one
    update profiles
      set default_org_id = v_inv.org_id
      where id = v_user and default_org_id is null;
  end loop;

  return v_count;
end $$;

comment on function consume_invitations is
  'Looks up pending org_invitations by the caller email and inserts member rows.';

-- =============================================================================
-- STORAGE BUCKET POLICIES — bucket name: imperial-files
-- =============================================================================
-- Object keys are `{org_id}/{file_id}/{version}`. The leading segment lets
-- policies scope by tenant. Authenticated users may read/write under orgs they
-- belong to; service-role bypasses for signed-URL minting and admin work.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'objects') then
    -- Drop & recreate for idempotency
    drop policy if exists imperial_objects_read on storage.objects;
    drop policy if exists imperial_objects_write on storage.objects;
    drop policy if exists imperial_objects_update on storage.objects;
    drop policy if exists imperial_objects_delete on storage.objects;

    create policy imperial_objects_read on storage.objects for select
      using (
        bucket_id = 'imperial-files'
        and (
          is_platform_admin()
          or is_org_member((string_to_array(name, '/'))[1]::uuid)
        )
      );

    create policy imperial_objects_write on storage.objects for insert
      with check (
        bucket_id = 'imperial-files'
        and is_org_member((string_to_array(name, '/'))[1]::uuid)
        and has_permission((string_to_array(name, '/'))[1]::uuid, 'file.upload')
      );

    create policy imperial_objects_update on storage.objects for update
      using (
        bucket_id = 'imperial-files'
        and has_permission((string_to_array(name, '/'))[1]::uuid, 'file.upload')
      );

    create policy imperial_objects_delete on storage.objects for delete
      using (
        bucket_id = 'imperial-files'
        and has_permission((string_to_array(name, '/'))[1]::uuid, 'file.delete')
      );
  end if;
end $$;
