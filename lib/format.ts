export function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(v < 10 ? 1 : 0)} ${u}`
    v /= 1024
  }
  return `${v.toFixed(0)} PB`
}

export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 604800) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
