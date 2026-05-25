#!/usr/bin/env node
// =============================================================================
// scripts/set-password.mjs
// One-off admin helper to set/reset a Supabase Auth password.
//
//   node scripts/set-password.mjs <email> <password>
//
// Uses SUPABASE_SERVICE_ROLE_KEY from .env.local — keep that key secret.
// If the user exists: updates their password and confirms their email.
// If not: creates the user with that password, email pre-confirmed (no link
// needed). Idempotent — safe to re-run.
// =============================================================================

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v
    }
  } catch { /* .env.local missing — assume env was passed in */ }
}
loadEnv('.env.local')

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/set-password.mjs <email> <password>')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supa = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const norm = email.trim().toLowerCase()

// Search by email — page through if needed.
let found = null
for (let page = 1; page <= 50 && !found; page++) {
  const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error(error.message); process.exit(1) }
  found = data.users.find(u => (u.email ?? '').toLowerCase() === norm) ?? null
  if (data.users.length < 200) break
}

if (found) {
  const { error } = await supa.auth.admin.updateUserById(found.id, {
    password, email_confirm: true,
  })
  if (error) { console.error(error.message); process.exit(1) }
  console.log(`✓ Password updated for ${email} (user id: ${found.id})`)
} else {
  const { data, error } = await supa.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) { console.error(error.message); process.exit(1) }
  console.log(`✓ Created ${email} with password (user id: ${data.user?.id})`)
}
