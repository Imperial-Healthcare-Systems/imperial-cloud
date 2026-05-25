import { Workspace } from '@/components/theme/workspace'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/**
 * The two-region layout. Sidebar lives OUTSIDE <Workspace> (permanent dark);
 * Topbar lives INSIDE (adaptive). This is the structural guarantee that the
 * theme toggle can never recolor the shell.
 */
export function AppShell({
  children,
  userEmail,
  userFullName,
  userRole,
  orgName,
  orgId,
  storageUsed,
  storageTotal,
}: {
  children: React.ReactNode
  userEmail?: string | null
  userFullName?: string | null
  userRole?: string | null
  orgName?: string | null
  orgId?: string | null
  storageUsed?: number
  storageTotal?: number
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar storageUsed={storageUsed} storageTotal={storageTotal} />
      <Workspace className="flex-1 flex flex-col min-w-0">
        <Topbar
          userEmail={userEmail}
          userFullName={userFullName}
          userRole={userRole}
          orgName={orgName}
          orgId={orgId}
          storageUsed={storageUsed}
          storageTotal={storageTotal}
        />
        <main className="flex-1 p-8">{children}</main>
      </Workspace>
    </div>
  )
}
