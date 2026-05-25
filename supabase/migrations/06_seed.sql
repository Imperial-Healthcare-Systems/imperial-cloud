-- =============================================================================
-- IMPERIAL CLOUD — 06: SEED DATA (roles, permissions, RBAC matrix)
-- =============================================================================

-- ── Roles (rank: lower = more privileged) ───────────────────────────────────
insert into roles (key, label, rank) values
  ('super_admin', 'Super Admin',        0),
  ('org_admin',   'Organization Admin', 1),
  ('manager',     'Manager',            2),
  ('employee',    'Employee',           3),
  ('client',      'Client',             4),
  ('guest',       'Guest',              5)
on conflict (key) do nothing;

-- ── Permissions ─────────────────────────────────────────────────────────────
insert into permissions (key, label, description) values
  ('file.create',    'Create files',        'Create new file records'),
  ('file.upload',    'Upload files',        'Upload file bytes / new versions'),
  ('file.download',  'Download files',      'Download file contents'),
  ('file.edit',      'Edit files',          'Rename, move, edit metadata'),
  ('file.delete',    'Delete files',        'Trash or remove files'),
  ('file.share',     'Share files',         'Create shares and links'),
  ('folder.create',  'Create folders',      'Create folders'),
  ('folder.edit',    'Edit folders',        'Rename / move folders'),
  ('folder.delete',  'Delete folders',      'Delete folders'),
  ('user.invite',    'Invite users',        'Invite new members'),
  ('user.manage',    'Manage users',        'Change roles, remove members'),
  ('billing.manage', 'Manage billing',      'Manage subscription & billing'),
  ('storage.manage', 'Manage storage',      'Adjust quotas, purge storage'),
  ('audit.access',   'Access audit logs',   'View audit & all-org content'),
  ('org.manage',     'Manage organization', 'Org settings & lifecycle'),
  ('settings.manage','Manage settings',     'API keys, webhooks, flags')
on conflict (key) do nothing;

-- ── The RBAC matrix ─────────────────────────────────────────────────────────
-- super_admin: everything (also bypasses via is_platform_admin, but granted too)
insert into role_permissions (role_key, permission_key)
  select 'super_admin', key from permissions on conflict do nothing;

-- org_admin: everything except nothing — full control within the org
insert into role_permissions (role_key, permission_key)
  select 'org_admin', key from permissions on conflict do nothing;

-- manager: content + team, no billing/org/settings
insert into role_permissions (role_key, permission_key) values
  ('manager','file.create'),('manager','file.upload'),('manager','file.download'),
  ('manager','file.edit'),('manager','file.delete'),('manager','file.share'),
  ('manager','folder.create'),('manager','folder.edit'),('manager','folder.delete'),
  ('manager','user.invite'),('manager','audit.access')
on conflict do nothing;

-- employee: own content lifecycle + sharing
insert into role_permissions (role_key, permission_key) values
  ('employee','file.create'),('employee','file.upload'),('employee','file.download'),
  ('employee','file.edit'),('employee','file.delete'),('employee','file.share'),
  ('employee','folder.create'),('employee','folder.edit'),('employee','folder.delete')
on conflict do nothing;

-- client: download + limited upload, no delete/manage
insert into role_permissions (role_key, permission_key) values
  ('client','file.download'),('client','file.upload'),('client','file.create')
on conflict do nothing;

-- guest: view/download only (view is implicit via shares; download explicit)
insert into role_permissions (role_key, permission_key) values
  ('guest','file.download')
on conflict do nothing;

-- ── Default app settings & flags ────────────────────────────────────────────
insert into app_settings (key, value) values
  ('upload.max_file_bytes',   '5368709120'::jsonb),     -- 5 GB per file
  ('upload.allowed_mime',     '["image/*","video/*","application/pdf","application/vnd.openxmlformats-officedocument.*","application/zip"]'::jsonb),
  ('share.link_default_ttl_days', '7'::jsonb),
  ('security.max_login_attempts', '5'::jsonb)
on conflict (key) do nothing;

insert into feature_flags (key, enabled, description) values
  ('realtime.presence', true,  'Show who is viewing a folder'),
  ('search.meilisearch', false,'Route search to Meilisearch instead of Postgres FTS'),
  ('virus_scan.enabled', true, 'Scan uploads before marking clean')
on conflict (key) do nothing;
