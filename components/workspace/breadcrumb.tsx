'use client'

import Link from 'next/link'
import { ChevronRight, HardDrive } from 'lucide-react'

export interface Crumb { id: string | null; name: string }

/**
 * Drive-rooted breadcrumb. The first crumb is always "My Drive" (id=null).
 * Each segment is a link to the same /drive page with `?folder=<id>`.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const all: Crumb[] = [{ id: null, name: 'My Drive' }, ...crumbs]
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm flex-wrap"
      style={{ color: 'var(--ic-ws-text-2)' }}
    >
      {all.map((c, i) => {
        const isLast = i === all.length - 1
        const href = c.id ? `/drive?folder=${c.id}` : '/drive'
        return (
          <span key={c.id ?? 'root'} className="inline-flex items-center gap-1">
            {i === 0 && <HardDrive size={14} strokeWidth={1.9} />}
            {isLast ? (
              <span style={{ color: 'var(--ic-ws-text)' }} className="font-medium">{c.name}</span>
            ) : (
              <Link href={href} className="hover:underline underline-offset-2">{c.name}</Link>
            )}
            {!isLast && <ChevronRight size={14} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-3)' }} />}
          </span>
        )
      })}
    </nav>
  )
}
