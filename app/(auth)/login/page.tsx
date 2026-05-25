import { Logo } from '@/components/theme/logo'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in · Imperial Cloud' }

export default function LoginPage() {
  return (
    <div
      className="w-full max-w-[400px] rounded-lg p-10 border"
      style={{
        background: 'var(--ic-ws-surface)',
        borderColor: 'var(--ic-ws-border)',
        boxShadow: 'var(--ic-ws-shadow-lifted)',
      }}
    >
      <div className="flex justify-center mb-8">
        <Logo height={36} priority />
      </div>
      <h1
        className="text-xl font-display font-semibold text-center mb-1"
        style={{ color: 'var(--ic-ws-text)' }}
      >
        Welcome back
      </h1>
      <p className="text-sm text-center mb-8" style={{ color: 'var(--ic-ws-text-2)' }}>
        Sign in to your Imperial Cloud workspace
      </p>
      <LoginForm />
    </div>
  )
}
