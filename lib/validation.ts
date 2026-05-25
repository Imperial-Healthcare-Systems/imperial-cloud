import { z } from 'zod'

/**
 * Imperial Cloud — API validation schemas.
 * Every route handler validates its input against one of these before touching
 * the database. Rejects malformed/oversized payloads at the edge.
 */

export const uuid = z.string().uuid()

// ── Files ───────────────────────────────────────────────────────────────────
export const createFileSchema = z.object({
  orgId: uuid,
  folderId: uuid.nullable().optional(),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
})

export const uploadVersionSchema = z.object({
  fileId: uuid,
  storagePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().max(5_368_709_120), // 5 GB cap
  mimeType: z.string().max(255).optional(),
  checksumSha256: z.string().length(64).optional(),
  changeNote: z.string().max(500).optional(),
})

export const rollbackSchema = z.object({
  fileId: uuid,
  versionNumber: z.number().int().positive(),
})

export const renameFileSchema = z.object({
  fileId: uuid,
  name: z.string().min(1).max(255),
})

export const moveFileSchema = z.object({
  fileId: uuid,
  folderId: uuid.nullable(),
})

// ── Folders ─────────────────────────────────────────────────────────────────
export const createFolderSchema = z.object({
  orgId: uuid,
  name: z.string().min(1).max(255),
  parentId: uuid.nullable().optional(),
})

// ── Sharing ─────────────────────────────────────────────────────────────────
export const createShareSchema = z.object({
  orgId: uuid,
  fileId: uuid.optional(),
  folderId: uuid.optional(),
  sharedWith: uuid,
  permission: z.enum(['view', 'comment', 'edit']).default('view'),
}).refine(d => !!d.fileId !== !!d.folderId, {
  message: 'Provide exactly one of fileId or folderId',
})

export const createLinkSchema = z.object({
  orgId: uuid,
  fileId: uuid.optional(),
  folderId: uuid.optional(),
  permission: z.enum(['view', 'comment', 'edit']).default('view'),
  password: z.string().min(4).max(128).optional(),
  maxDownloads: z.number().int().positive().optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
}).refine(d => !!d.fileId !== !!d.folderId, {
  message: 'Provide exactly one of fileId or folderId',
})

// ── Members / Admin ─────────────────────────────────────────────────────────
export const inviteMemberSchema = z.object({
  orgId: uuid,
  email: z.string().email(),
  roleKey: z.enum(['org_admin', 'manager', 'employee', 'client', 'guest']),
  quotaBytes: z.number().int().positive().optional(),
})

export const updateMemberSchema = z.object({
  orgId: uuid,
  userId: uuid,
  roleKey: z.enum(['org_admin', 'manager', 'employee', 'client', 'guest']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  quotaBytes: z.number().int().positive().nullable().optional(),
})

// ── Organizations ───────────────────────────────────────────────────────────
export const createOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Use 2–40 chars: a-z, 0-9, dash'),
})

// ── Folder rename/move ──────────────────────────────────────────────────────
export const updateFolderSchema = z.object({
  folderId: uuid,
  name: z.string().min(1).max(255).optional(),
  parentId: uuid.nullable().optional(),
}).refine(d => d.name !== undefined || d.parentId !== undefined, {
  message: 'Provide name or parentId',
})

// ── Trash file/folder ───────────────────────────────────────────────────────
export const trashSchema = z.object({
  fileId: uuid.optional(),
  folderId: uuid.optional(),
}).refine(d => !!d.fileId !== !!d.folderId, {
  message: 'Provide exactly one of fileId or folderId',
})

// ── Storage URL minting ─────────────────────────────────────────────────────
export const uploadUrlSchema = z.object({
  orgId: uuid,
  fileId: uuid,
  contentType: z.string().max(255).optional(),
})
export const downloadUrlSchema = z.object({
  fileId: uuid,
  versionNumber: z.number().int().positive().optional(),
})

// ── Search ──────────────────────────────────────────────────────────────────
export const searchSchema = z.object({
  orgId: uuid,
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'name', 'tag', 'content']).default('all'),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
})

export type CreateFileInput = z.infer<typeof createFileSchema>
export type UploadVersionInput = z.infer<typeof uploadVersionSchema>
export type CreateShareInput = z.infer<typeof createShareSchema>
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>
export type SearchInput = z.infer<typeof searchSchema>
