# Imperial Cloud

Enterprise cloud storage & collaboration platform for Imperial Tech Innovations.

Built on Next.js 14 (App Router) · TypeScript (strict) · Tailwind · Framer Motion · Supabase (Postgres + Auth + Storage + Realtime) · Upstash Redis · Vercel · Zod.

## What's here (Session 1–2 foundation)

```
app/                          Next.js App Router
  api/files/route.ts          canonical handler pattern
  api/sharing/route.ts        internal shares + tokenized links
  layout.tsx, page.tsx        shell + landing
  globals.css                 two-layer theme tokens
components/theme/             Workspace, Logo, ThemeToggle, ThemeSegmented
hooks/use-theme.ts            SSR-safe theme hook
providers/theme-provider.tsx  next-themes wrapper
lib/
  api.ts                      clients, RBAC guard, rate limit, audit, responses
  validation.ts               Zod schemas (single source of API input types)
  theme-config.ts             shell + workspace tokens
supabase/migrations/          01–07: foundation → files → sharing/audit
                              → functions → RLS → seed → search/realtime
```

## Setup

1. `cp .env.example .env.local` and fill keys (see [`IMPERIAL_CLOUD_BUILD.md`](IMPERIAL_CLOUD_BUILD.md)).
2. `pnpm install`
3. Run migrations 01–07 in the Supabase SQL editor, in order.
4. Create a private Storage bucket named `imperial-files`.
5. `pnpm dev` and open http://localhost:3000.

## Next sessions

See [`CLAUDE.md`](CLAUDE.md) for the build conventions and module order. Build feature-by-feature, copying the established patterns (`app/api/files/route.ts` and the theme token system). Typecheck and commit between modules.
