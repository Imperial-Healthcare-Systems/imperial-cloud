'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Folder, FileText, Upload as UploadIcon, FolderPlus, Trash2, Download,
  Move as MoveIcon, Pencil, Share2,
} from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/lib/fetcher'
import { formatBytes, formatRelative } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/card'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { MoveDialog } from './move-dialog'
import { ShareDialog } from './share-dialog'

/**
 * Internal drag MIME type. Lets us distinguish dragging a file row (move
 * within the app) from dragging OS files into the browser (upload).
 */
const DT_INTERNAL = 'application/x-imperial-file-id'

interface FolderRow {
  id: string; name: string; parent_id: string | null; owner_id: string; created_at: string
}
interface FileRow {
  id: string; name: string; mime_type: string | null;
  size_bytes: number; folder_id: string | null; owner_id: string;
  created_at: string; updated_at: string
}

export function FileExplorer({
  orgId, folderId, currentUserId,
}: { orgId: string; folderId: string | null; currentUserId: string }) {
  const router = useRouter()
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Move / rename / share targets (the resource currently being acted on).
  const [moveTarget, setMoveTarget] = useState<FileRow | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null)
  const [shareTarget, setShareTarget] = useState<
    | { type: 'file'; id: string; name: string; ownerId: string }
    | { type: 'folder'; id: string; name: string; ownerId: string }
    | null
  >(null)

  // Drag state: which folder is currently a hover target for an internal move?
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  // External (OS-file) drag → toggles the big "Drop to upload" overlay.
  const [externalDrop, setExternalDrop] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const fparams = new URLSearchParams({ orgId })
      if (folderId) fparams.set('parentId', folderId)
      const dparams = new URLSearchParams({ orgId })
      if (folderId) dparams.set('folderId', folderId)
      const [fRes, dRes] = await Promise.all([
        apiGet<{ items: FolderRow[] }>(`/api/folders?${fparams}`),
        apiGet<{ items: FileRow[] }>(`/api/files?${dparams}`),
      ])
      setFolders(fRes.items); setFiles(dRes.items)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [orgId, folderId])

  useEffect(() => { load() }, [load])

  // --- Upload (OS files) ---------------------------------------------------
  const onFiles = useCallback(async (fileList: FileList) => {
    const sb = browserClient()
    for (const file of Array.from(fileList)) {
      const tempId = `${file.name}-${file.size}-${Date.now()}`
      setUploading(u => ({ ...u, [tempId]: 0 }))
      try {
        const created = await apiPost<{ id: string; org_id: string }>('/api/files', {
          orgId, folderId, name: file.name, mimeType: file.type || undefined,
        })
        const urlRes = await apiPost<{ bucket: string; path: string; token: string }>('/api/storage/upload-url', {
          orgId, fileId: created.id, contentType: file.type || undefined,
        })
        const up = await sb.storage.from(urlRes.bucket).uploadToSignedUrl(
          urlRes.path, urlRes.token, file, { contentType: file.type || undefined },
        )
        if (up.error) throw new Error(up.error.message)
        setUploading(u => ({ ...u, [tempId]: 90 }))
        await apiPut('/api/files', {
          fileId: created.id, storagePath: urlRes.path, sizeBytes: file.size,
          mimeType: file.type || undefined,
        })
        setUploading(u => { const n = { ...u }; delete n[tempId]; return n })
      } catch (e) {
        setUploading(u => { const n = { ...u }; delete n[tempId]; return n })
        setErr(e instanceof Error ? e.message : 'Upload failed')
      }
    }
    await load()
    router.refresh()
  }, [orgId, folderId, load, router])

  // --- Actions -------------------------------------------------------------
  async function trashFile(id: string) {
    if (!confirm('Move this file to Trash?')) return
    const prev = files
    setFiles(curr => curr.filter(f => f.id !== id))   // optimistic
    try { await apiPost('/api/files/trash', { fileId: id }) }
    catch (e) {
      setFiles(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not trash')
    }
  }
  async function trashFolder(id: string) {
    if (!confirm('Move this folder (and its contents) to Trash?')) return
    const prev = folders
    setFolders(curr => curr.filter(f => f.id !== id))
    try { await apiDelete(`/api/folders?id=${id}`) }
    catch (e) {
      setFolders(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not trash')
    }
  }
  async function download(id: string) {
    try {
      const { signedUrl } = await apiPost<{ signedUrl: string }>('/api/storage/download-url', { fileId: id })
      window.open(signedUrl, '_blank')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not generate download link')
    }
  }

  /**
   * Optimistic move: a moved file is leaving the current view (unless the
   * destination is the same folder we're already in, which we no-op).
   * On error, revert and surface the message.
   */
  async function moveFile(fileId: string, destFolderId: string | null) {
    if ((destFolderId ?? null) === (folderId ?? null)) return
    const prev = files
    setFiles(curr => curr.filter(f => f.id !== fileId))
    try {
      await apiPost('/api/files/move', { fileId, folderId: destFolderId })
    } catch (e) {
      setFiles(prev)
      setErr(e instanceof ApiError ? e.message : 'Move failed')
    }
  }

  async function renameFile(fileId: string, name: string) {
    const prev = files
    setFiles(curr => curr.map(f => f.id === fileId ? { ...f, name } : f))
    try {
      await apiPost('/api/files/rename', { fileId, name })
    } catch (e) {
      setFiles(prev)
      setErr(e instanceof ApiError ? e.message : 'Rename failed')
      throw e
    }
  }

  // --- Drag & drop ---------------------------------------------------------
  function onFileDragStart(e: React.DragEvent, fileId: string) {
    e.dataTransfer.setData(DT_INTERNAL, fileId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    if (!e.dataTransfer.types.includes(DT_INTERNAL)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }
  function onFolderDragLeave() { setDragOverFolderId(null) }
  function onFolderDrop(e: React.DragEvent, destFolderId: string) {
    e.preventDefault()
    setDragOverFolderId(null)
    const fileId = e.dataTransfer.getData(DT_INTERNAL)
    if (fileId) moveFile(fileId, destFolderId)
  }

  // Outer-zone drag handlers only react to OS files (uploads).
  function onOuterDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setExternalDrop(true)
  }
  function onOuterDragLeave(e: React.DragEvent) {
    // Only clear when leaving the wrapper entirely (not on inner enters).
    if (e.currentTarget === e.target) setExternalDrop(false)
  }
  function onOuterDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setExternalDrop(false)
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={onOuterDragOver}
      onDragLeave={onOuterDragLeave}
      onDrop={onOuterDrop}
      className="relative"
    >
      {/* Action bar */}
      <div className="flex items-center gap-2 mb-4">
        <input
          ref={fileInputRef}
          type="file" multiple className="hidden"
          onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = '' }}
        />
        <Button type="button" onClick={() => fileInputRef.current?.click()}>
          <UploadIcon size={15} strokeWidth={1.9} /> Upload
        </Button>
        <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
          <FolderPlus size={15} strokeWidth={1.9} /> New folder
        </Button>
      </div>

      {err && (
        <div
          className="mb-4 px-3 py-2 rounded-md text-sm flex items-center justify-between"
          style={{
            background: 'color-mix(in oklab, var(--ic-ws-error) 12%, transparent)',
            color: 'var(--ic-ws-error)',
          }}
        >
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="text-xs underline">dismiss</button>
        </div>
      )}

      {Object.keys(uploading).length > 0 && (
        <div className="mb-4 flex flex-col gap-1 text-xs" style={{ color: 'var(--ic-ws-text-2)' }}>
          {Object.entries(uploading).map(([k, p]) => (
            <div key={k}>Uploading {k.split('-')[0]}… {p}%</div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>Loading…</div>
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState
          title="This folder is empty"
          body="Drag files in to upload, or use the buttons above."
        />
      ) : (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ic-ws-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--ic-ws-elevated)' }}>
              <tr>
                <Th>Name</Th>
                <Th className="w-32">Size</Th>
                <Th className="w-40">Modified</Th>
                <Th className="w-12"></Th>
              </tr>
            </thead>
            <tbody>
              {folders.map(f => {
                const isDropTarget = dragOverFolderId === f.id
                return (
                  <tr
                    key={f.id}
                    className="border-t transition-colors"
                    style={{
                      borderColor: 'var(--ic-ws-border)',
                      background: isDropTarget
                        ? 'color-mix(in oklab, var(--ic-ws-brand-bright) 14%, transparent)'
                        : 'transparent',
                      boxShadow: isDropTarget
                        ? 'inset 0 0 0 1px var(--ic-ws-brand-ring)'
                        : 'none',
                    }}
                    onDragOver={(e) => onFolderDragOver(e, f.id)}
                    onDragLeave={onFolderDragLeave}
                    onDrop={(e) => onFolderDrop(e, f.id)}
                  >
                    <Td>
                      <a
                        href={`/drive?folder=${f.id}`}
                        className="inline-flex items-center gap-2 hover:underline underline-offset-2"
                        style={{ color: 'var(--ic-ws-text)' }}
                      >
                        <Folder size={16} strokeWidth={1.9} style={{ color: 'var(--ic-ws-brand-bright)' }} />
                        {f.name}
                      </a>
                    </Td>
                    <Td style={{ color: 'var(--ic-ws-text-3)' }}>—</Td>
                    <Td style={{ color: 'var(--ic-ws-text-2)' }}>{formatRelative(f.created_at)}</Td>
                    <Td>
                      <Menu ariaLabel={`Actions for ${f.name}`}>
                        <MenuItem
                          icon={Share2}
                          onClick={() => setShareTarget({ type: 'folder', id: f.id, name: f.name, ownerId: f.owner_id })}
                        >
                          Share
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={Trash2} destructive onClick={() => trashFolder(f.id)}>Move to Trash</MenuItem>
                      </Menu>
                    </Td>
                  </tr>
                )
              })}

              {files.map(f => (
                <tr
                  key={f.id}
                  className="border-t cursor-grab active:cursor-grabbing"
                  style={{ borderColor: 'var(--ic-ws-border)' }}
                  draggable
                  onDragStart={(e) => onFileDragStart(e, f.id)}
                >
                  <Td>
                    <span className="inline-flex items-center gap-2" style={{ color: 'var(--ic-ws-text)' }}>
                      <FileText size={16} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-2)' }} />
                      {f.name}
                    </span>
                  </Td>
                  <Td style={{ color: 'var(--ic-ws-text-2)' }}>{formatBytes(f.size_bytes)}</Td>
                  <Td style={{ color: 'var(--ic-ws-text-2)' }}>{formatRelative(f.updated_at)}</Td>
                  <Td>
                    <Menu ariaLabel={`Actions for ${f.name}`}>
                      <MenuItem icon={Download} onClick={() => download(f.id)}>Download</MenuItem>
                      <MenuItem
                        icon={Share2}
                        onClick={() => setShareTarget({ type: 'file', id: f.id, name: f.name, ownerId: f.owner_id })}
                      >
                        Share
                      </MenuItem>
                      <MenuItem icon={Pencil} onClick={() => setRenameTarget(f)}>Rename</MenuItem>
                      <MenuItem icon={MoveIcon} onClick={() => setMoveTarget(f)}>Move to…</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={Trash2} destructive onClick={() => trashFile(f.id)}>Move to Trash</MenuItem>
                    </Menu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* External upload overlay (OS files only — internal drags don't trigger this) */}
      {externalDrop && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none border-2 border-dashed grid place-items-center text-sm font-medium"
          style={{
            borderColor: 'var(--ic-ws-brand-bright)',
            background: 'color-mix(in oklab, var(--ic-ws-brand-bright) 8%, transparent)',
            color: 'var(--ic-ws-brand-bright)',
          }}
        >
          Drop to upload
        </div>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        orgId={orgId}
        parentId={folderId}
        onCreated={async () => { setNewFolderOpen(false); await load() }}
      />

      <MoveDialog
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        orgId={orgId}
        file={moveTarget ? { id: moveTarget.id, name: moveTarget.name, folder_id: moveTarget.folder_id } : null}
        onMoved={(dest) => {
          if (moveTarget) {
            // Optimistically remove the row if it's leaving this folder.
            if ((dest ?? null) !== (folderId ?? null)) {
              setFiles(curr => curr.filter(f => f.id !== moveTarget.id))
            }
          }
          setMoveTarget(null)
        }}
      />

      <RenameDialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        file={renameTarget}
        onRename={async (id, name) => {
          await renameFile(id, name)
          setRenameTarget(null)
        }}
      />

      <ShareDialog
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        orgId={orgId}
        currentUserId={currentUserId}
        resource={shareTarget}
      />
    </div>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left text-xs font-medium px-4 py-2 ${className}`}
      style={{ color: 'var(--ic-ws-text-2)' }}
    >
      {children}
    </th>
  )
}
function Td({ children, className = '', style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={`px-4 py-2.5 ${className}`} style={style}>{children}</td>
}

function NewFolderDialog({ open, onClose, orgId, parentId, onCreated }: {
  open: boolean; onClose: () => void; orgId: string; parentId: string | null; onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true)
    try {
      await apiPost('/api/folders', { orgId, name, parentId })
      setName(''); onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create folder')
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="New folder">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Folder name">
          <Input value={name} onChange={e => setName(e.target.value)} required maxLength={255} autoFocus />
        </Field>
        {error && <p className="text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create</Button>
        </div>
      </form>
    </Dialog>
  )
}

function RenameDialog({ open, onClose, file, onRename }: {
  open: boolean
  onClose: () => void
  file: FileRow | null
  onRename: (id: string, name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && file) { setName(file.name); setError(null) }
  }, [open, file])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    if (name.trim() === '' || name === file.name) { onClose(); return }
    setBusy(true); setError(null)
    try { await onRename(file.id, name) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Rename failed') }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Rename file">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input
            value={name} onChange={e => setName(e.target.value)}
            required maxLength={255} autoFocus
            onFocus={(e) => {
              // Select the basename, leave the extension untouched.
              const dot = e.currentTarget.value.lastIndexOf('.')
              if (dot > 0) e.currentTarget.setSelectionRange(0, dot)
              else e.currentTarget.select()
            }}
          />
        </Field>
        {error && <p className="text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Dialog>
  )
}
