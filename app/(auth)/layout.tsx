import { Workspace } from '@/components/theme/workspace'

/**
 * Auth pages render INSIDE a <Workspace> so the login screen uses the
 * adaptive (light-by-default-feel) tokens, contrasting with the dark app
 * shell that authenticated users will see. The colored logo lives here.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Workspace className="min-h-screen flex items-center justify-center px-4">
      {children}
    </Workspace>
  )
}
