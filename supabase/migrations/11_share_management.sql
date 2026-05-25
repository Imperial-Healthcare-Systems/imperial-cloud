-- =============================================================================
-- IMPERIAL CLOUD — 11: SHARE MANAGEMENT POLICIES
-- =============================================================================
-- The share-dialog UI needs two things RLS didn't cover yet:
--   • UPDATE policy on shares — to change a share's permission level.
--   • Broader DELETE policy — the resource owner should be able to revoke a
--     share they didn't personally create (e.g., a manager shared their file
--     and later left the team).
-- =============================================================================

drop policy if exists share_delete on shares;
create policy share_delete on shares for delete
  using (
    shared_by = auth.uid()
    or has_permission(org_id, 'user.manage')
    or exists (select 1 from files f where f.id = shares.file_id and f.owner_id = auth.uid())
    or exists (select 1 from folders fo where fo.id = shares.folder_id and fo.owner_id = auth.uid())
  );

drop policy if exists share_update on shares;
create policy share_update on shares for update
  using (
    shared_by = auth.uid()
    or has_permission(org_id, 'user.manage')
    or exists (select 1 from files f where f.id = shares.file_id and f.owner_id = auth.uid())
    or exists (select 1 from folders fo where fo.id = shares.folder_id and fo.owner_id = auth.uid())
  );

-- Same broadening for shared_links delete (revoke a tokenized link).
drop policy if exists link_delete on shared_links;
create policy link_delete on shared_links for delete
  using (
    created_by = auth.uid()
    or has_permission(org_id, 'user.manage')
    or exists (select 1 from files f where f.id = shared_links.file_id and f.owner_id = auth.uid())
    or exists (select 1 from folders fo where fo.id = shared_links.folder_id and fo.owner_id = auth.uid())
  );

comment on policy share_update on shares is
  'Permission updates allowed for: original sharer, org user.manage, or resource owner.';
