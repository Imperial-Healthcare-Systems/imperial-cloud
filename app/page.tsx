import { redirect } from 'next/navigation'
import { userClient } from '@/lib/api'

/**
 * Root. Sends authenticated users straight to /drive; everyone else to /login.
 * Kept as a Server Component so the redirect happens before any HTML is sent.
 */
export default async function RootPage() {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/drive' : '/login')
}
