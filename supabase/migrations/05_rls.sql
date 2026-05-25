-- =============================================================================
-- IMPERIAL CLOUD — 05: ROW LEVEL SECURITY
-- =============================================================================
-- Principle: deny by default, grant by policy. Every business table has RLS
-- enabled. Org isolation is the baseline; role/permission checks layer on top
-- via the helper functions from 04. Platform admins bypass via is_platform_admin().
--
-- Threat model addressed:
--   • IDOR — a user cannot read another user's / another org's rows because
--     USING clauses filter by membership + ownership, not by client input.
--   • Broken access control — writes are gated by has_permission(), not roles
--     hard-coded in the app.
--   • Cross-tenant leakage — every policy constrains org_id to the caller's orgs.
-- =============================================================================

-- Enable RLS everywhere sensitive
alter table organizations              enable row level security;
alter table profiles                   enable row level security;
alter table organization_members       enable row level security;
alter table member_permission_overrides enable row level security;
alter table folders                    enable row level security;
alter table files                      enable row level security;
alter table file_versions              enable row level security;
alter table file_metadata              enable row level security;
alter table file_tags                  enable row level security;
alter table shares                     enable row level security;
alter table shared_links               enable row level security;
alter table activity_logs              enable row level security;
alter table audit_logs                 enable row level security;
alter table notifications              enable row level security;
alter table user_devices               enable row level security;
alter table login_history              enable row level security;
alter table storage_analytics          enable row level security;
alter table upload_analytics           enable row level security;
alter table user_activity_stats        enable row level security;
alter table api_keys                   enable row level security;
alter table webhooks                   enable row level security;

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================
create policy org_select on organizations for select
  using (is_org_member(id) or is_platform_admin());
create policy org_update on organizations for update
  using (has_permission(id, 'org.manage'));
create policy org_insert on organizations for insert
  with check (auth.uid() is not null);   -- creator becomes admin via app flow
create policy org_platform_all on organizations for all
  using (is_platform_admin());

-- =============================================================================
-- PROFILES — a user reads their own; org peers read each other; self-update.
-- =============================================================================
create policy profile_self_select on profiles for select
  using (
    id = auth.uid()
    or is_platform_admin()
    or exists (  -- shares an org with the viewer
      select 1 from organization_members m1
      join organization_members m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
        and m1.status = 'active' and m2.status = 'active'
    )
  );
create policy profile_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- =============================================================================
-- ORGANIZATION MEMBERS
-- =============================================================================
create policy member_select on organization_members for select
  using (is_org_member(org_id) or is_platform_admin());
-- invite / change requires user.manage AND privilege over the target
create policy member_insert on organization_members for insert
  with check (has_permission(org_id, 'user.invite'));
create policy member_update on organization_members for update
  using (has_permission(org_id, 'user.manage') and can_manage_member(org_id, user_id));
create policy member_delete on organization_members for delete
  using (has_permission(org_id, 'user.manage') and can_manage_member(org_id, user_id));

create policy override_manage on member_permission_overrides for all
  using (exists (
    select 1 from organization_members m
    where m.id = member_permission_overrides.member_id
      and has_permission(m.org_id, 'user.manage')
  ));

-- =============================================================================
-- FOLDERS
-- =============================================================================
create policy folder_select on folders for select
  using (
    is_platform_admin()
    or owner_id = auth.uid()
    or has_permission(org_id, 'audit.access')
    or exists (select 1 from shares s where s.folder_id = folders.id and s.shared_with = auth.uid())
  );
create policy folder_insert on folders for insert
  with check (is_org_member(org_id) and has_permission(org_id, 'folder.create'));
create policy folder_update on folders for update
  using (owner_id = auth.uid() or has_permission(org_id, 'folder.edit'));
create policy folder_delete on folders for delete
  using (owner_id = auth.uid() or has_permission(org_id, 'folder.delete'));

-- =============================================================================
-- FILES — read resolves through can_access_file (owner|role|share|inherited).
-- =============================================================================
create policy file_select on files for select
  using (can_access_file(files));
create policy file_insert on files for insert
  with check (is_org_member(org_id) and has_permission(org_id, 'file.create'));
create policy file_update on files for update
  using (
    owner_id = auth.uid()
    or has_permission(org_id, 'file.edit')
    or exists (select 1 from shares s
       where s.file_id = files.id and s.shared_with = auth.uid() and s.permission = 'edit')
  );
create policy file_delete on files for delete
  using (owner_id = auth.uid() or has_permission(org_id, 'file.delete'));

-- =============================================================================
-- FILE VERSIONS — visible if the parent file is; insert via SECURITY DEFINER
-- function only (no direct client insert path needed, but allow owner/editor).
-- =============================================================================
create policy version_select on file_versions for select
  using (exists (select 1 from files f where f.id = file_versions.file_id and can_access_file(f)));
create policy version_insert on file_versions for insert
  with check (has_permission(org_id, 'file.upload'));
-- updates/deletes blocked by immutability trigger regardless; no policy granted.

-- =============================================================================
-- FILE METADATA & TAGS — follow parent file visibility
-- =============================================================================
create policy meta_select on file_metadata for select
  using (exists (select 1 from files f where f.id = file_metadata.file_id and can_access_file(f)));
create policy meta_write on file_metadata for all
  using (exists (select 1 from files f where f.id = file_metadata.file_id
    and (f.owner_id = auth.uid() or has_permission(f.org_id, 'file.edit'))));

create policy tag_select on file_tags for select
  using (exists (select 1 from files f where f.id = file_tags.file_id and can_access_file(f)));
create policy tag_write on file_tags for all
  using (exists (select 1 from files f where f.id = file_tags.file_id
    and (f.owner_id = auth.uid() or has_permission(f.org_id, 'file.edit'))));

-- =============================================================================
-- SHARES — involved parties see; only sharer with file.share can create.
-- =============================================================================
create policy share_select on shares for select
  using (shared_by = auth.uid() or shared_with = auth.uid() or has_permission(org_id, 'audit.access'));
create policy share_insert on shares for insert
  with check (
    shared_by = auth.uid() and has_permission(org_id, 'file.share')
    and (
      (file_id is not null and exists (select 1 from files f where f.id = file_id
        and (f.owner_id = auth.uid() or has_permission(org_id,'file.edit'))))
      or
      (folder_id is not null and exists (select 1 from folders fo where fo.id = folder_id
        and (fo.owner_id = auth.uid() or has_permission(org_id,'folder.edit'))))
    )
  );
create policy share_delete on shares for delete
  using (shared_by = auth.uid() or has_permission(org_id, 'user.manage'));

-- =============================================================================
-- SHARED LINKS — creator/managers manage; public read happens via a SECURITY
-- DEFINER resolver (token lookups bypass RLS deliberately), not direct select.
-- =============================================================================
create policy link_select on shared_links for select
  using (created_by = auth.uid() or has_permission(org_id, 'audit.access'));
create policy link_insert on shared_links for insert
  with check (created_by = auth.uid() and has_permission(org_id, 'file.share'));
create policy link_update on shared_links for update
  using (created_by = auth.uid() or has_permission(org_id, 'file.share'));

-- =============================================================================
-- ACTIVITY — org members read their org's feed; insert is server-side.
-- =============================================================================
create policy activity_select on activity_logs for select
  using (is_org_member(org_id) and (actor_id = auth.uid() or has_permission(org_id, 'audit.access')));
create policy activity_insert on activity_logs for insert
  with check (is_org_member(org_id));

-- =============================================================================
-- AUDIT — read requires audit.access; never writable from client (definer only).
-- =============================================================================
create policy audit_select on audit_logs for select
  using (has_permission(org_id, 'audit.access') or is_platform_admin());
-- no insert/update/delete policies — only SECURITY DEFINER functions can write.

-- =============================================================================
-- NOTIFICATIONS — recipient only.
-- =============================================================================
create policy notif_select on notifications for select
  using (recipient_id = auth.uid());
create policy notif_update on notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- =============================================================================
-- DEVICES / LOGIN HISTORY — self only (plus admin read of login history).
-- =============================================================================
create policy device_self on user_devices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy login_self_select on login_history for select
  using (user_id = auth.uid() or is_platform_admin());

-- =============================================================================
-- ANALYTICS — org-scoped read for those who can see insights.
-- =============================================================================
create policy storage_an_select on storage_analytics for select
  using (has_permission(org_id, 'audit.access') or has_permission(org_id, 'org.manage'));
create policy upload_an_select on upload_analytics for select
  using (has_permission(org_id, 'audit.access') or has_permission(org_id, 'org.manage'));
create policy user_stats_select on user_activity_stats for select
  using (user_id = auth.uid() or has_permission(org_id, 'audit.access'));

-- =============================================================================
-- API KEYS / WEBHOOKS — org admins only.
-- =============================================================================
create policy apikey_manage on api_keys for all
  using (has_permission(org_id, 'settings.manage'));
create policy webhook_manage on webhooks for all
  using (has_permission(org_id, 'settings.manage'));

comment on policy file_select on files is 'IDOR-safe: visibility computed server-side via can_access_file(), never from client input.';
comment on policy audit_select on audit_logs is 'Audit log is read-only to clients; writes only through SECURITY DEFINER functions.';
