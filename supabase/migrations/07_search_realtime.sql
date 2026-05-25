-- =============================================================================
-- IMPERIAL CLOUD — 07: SEARCH & REALTIME
-- =============================================================================

-- ── Full-text + fuzzy search RPC ────────────────────────────────────────────
-- Combines tsvector ranking (content/name) with trigram similarity (typo
-- tolerance on filenames). RLS on `files` still applies inside the function
-- because it's SECURITY INVOKER (default), so results are pre-filtered to what
-- the caller may see — search can never leak inaccessible files.
create or replace function search_files(
  p_org uuid, p_query text, p_kind text default 'all', p_limit int default 25
) returns table (
  id uuid, name text, mime_type text, size_bytes bigint,
  folder_id uuid, rank real
) language sql stable as $$
  select f.id, f.name, f.mime_type, f.size_bytes, f.folder_id,
    greatest(
      ts_rank(f.search_tsv, websearch_to_tsquery('english', p_query)),
      similarity(f.name, p_query)
    )::real as rank
  from files f
  where f.org_id = p_org
    and not f.is_trashed
    and (
      case p_kind
        when 'name' then f.name % p_query
        when 'content' then f.search_tsv @@ websearch_to_tsquery('english', p_query)
        when 'tag' then exists (select 1 from file_tags t where t.file_id = f.id and t.tag % p_query)
        else (
          f.search_tsv @@ websearch_to_tsquery('english', p_query)
          or f.name % p_query
          or exists (select 1 from file_tags t where t.file_id = f.id and t.tag % p_query)
        )
      end
    )
  order by rank desc
  limit p_limit;
$$;

-- ── Realtime publication ────────────────────────────────────────────────────
-- Supabase Realtime broadcasts row changes on tables in this publication.
-- Clients subscribe with org/user filters; RLS still governs what each
-- subscriber actually receives (Realtime respects RLS for authenticated users).
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table folders;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activity_logs;
alter publication supabase_realtime add table shares;

-- For presence (who's viewing a folder), use Supabase Realtime "presence"
-- channels keyed by folder_id — ephemeral, no table needed.

comment on function search_files is 'FTS + trigram hybrid. SECURITY INVOKER — RLS pre-filters; cannot leak inaccessible files.';
