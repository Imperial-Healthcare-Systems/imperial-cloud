-- =============================================================================
-- IMPERIAL CLOUD — 09: SIGNUP POLISH
-- =============================================================================
-- Adds:
--   • create_organization_for_user(user_id, name, slug)  — same atomic bootstrap
--     as create_organization() but takes user_id explicitly so triggers and
--     server jobs (which have no auth.uid()) can use it.
--   • Extended handle_new_user() — when a signup carries
--     raw_user_meta_data.workspace_name, auto-create the workspace, make the
--     user org_admin, and set default_org_id in the same transaction as the
--     profile insert. Eliminates the /onboarding step for users who provided
--     a workspace name during signup.
-- =============================================================================

-- ── Server/trigger-callable workspace bootstrap ─────────────────────────────
create or replace function create_organization_for_user(
  p_user_id uuid, p_name text, p_slug text
) returns organizations
language plpgsql security definer set search_path = public as $$
declare v_org organizations;
begin
  if p_user_id is null then raise exception 'user id required'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;
  if p_slug !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'slug must be 2-40 chars: a-z, 0-9, dash';
  end if;

  -- Guarantee the profile row exists.
  insert into profiles(id, email)
    select id, email from auth.users where id = p_user_id
    on conflict (id) do nothing;

  insert into organizations(name, slug) values (trim(p_name), p_slug)
    returning * into v_org;

  insert into organization_members(org_id, user_id, role_key, status, joined_at)
    values (v_org.id, p_user_id, 'org_admin', 'active', now());

  update profiles set default_org_id = v_org.id where id = p_user_id;
  return v_org;
end $$;

comment on function create_organization_for_user is
  'Server/trigger variant of create_organization. Takes user_id explicitly (no auth.uid() context).';

-- ── User-facing RPC now delegates to the shared helper ──────────────────────
create or replace function create_organization(
  p_name text, p_slug text
) returns organizations
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  return create_organization_for_user(v_user, p_name, p_slug);
end $$;

-- ── handle_new_user — also auto-create workspace if metadata says so ────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ws_name text;
  v_base text;
  v_slug text;
  v_i int := 0;
begin
  -- Create the profile row (existing behavior).
  insert into profiles(id, email, full_name)
    values (new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;

  -- Optional: auto-create a workspace if signup carried a workspace_name.
  v_ws_name := nullif(trim(coalesce(new.raw_user_meta_data->>'workspace_name', '')), '');
  if v_ws_name is not null then
    -- Derive a slug from the workspace name; resolve collisions with -N suffix.
    v_base := lower(regexp_replace(v_ws_name, '[^a-z0-9]+', '-', 'g'));
    v_base := regexp_replace(v_base, '^-+|-+$', '', 'g');
    if length(v_base) < 2 then v_base := 'workspace'; end if;
    v_base := substring(v_base from 1 for 40);

    v_slug := v_base;
    while exists (select 1 from organizations where slug = v_slug) loop
      v_i := v_i + 1;
      v_slug := substring(v_base from 1 for 38) || '-' || v_i;
    end loop;

    -- Best-effort: don't fail the auth signup if the workspace insert errors.
    begin
      perform create_organization_for_user(new.id, v_ws_name, v_slug);
    exception when others then
      -- Silently swallow — the user can still complete onboarding manually.
      null;
    end;
  end if;

  return new;
end $$;
