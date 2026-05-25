-- =============================================================================
-- IMPERIAL CLOUD — 10: INVITE ACCEPTANCE BY TOKEN
-- =============================================================================
-- Adds the explicit accept-by-token path used by the /invite/<token> landing
-- page. Distinct from consume_invitations() (which matches by email at the
-- next login) because:
--   • the token represents an explicit capability the recipient is holding,
--   • we still verify the auth.uid()'s email matches the invite email so a
--     leaked link can't be redeemed by an unrelated logged-in user.
-- =============================================================================

create or replace function accept_invitation_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_hash text;
  v_inv org_invitations;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;

  select email into v_email from auth.users where id = v_user;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_inv from org_invitations
    where token_hash = v_hash
    for update;

  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is %', v_inv.status;
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update org_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation expired';
  end if;
  if lower(coalesce(v_email,'')) <> lower(v_inv.email) then
    raise exception 'this invitation is for %', v_inv.email;
  end if;

  insert into organization_members(org_id, user_id, role_key, status, joined_at, invited_by)
    values (v_inv.org_id, v_user, v_inv.role_key, 'active', now(), v_inv.invited_by)
    on conflict (org_id, user_id) do nothing;

  update org_invitations set status = 'accepted' where id = v_inv.id;

  -- If user has no default workspace, adopt this one.
  update profiles
    set default_org_id = v_inv.org_id
    where id = v_user and default_org_id is null;

  return jsonb_build_object(
    'org_id', v_inv.org_id,
    'role_key', v_inv.role_key
  );
end $$;

comment on function accept_invitation_by_token is
  'Token-driven invite acceptance. Validates the caller email matches the invite to prevent link-hijacking.';
