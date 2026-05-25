import { Suspense } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/theme/logo'
import { SignupForm } from './signup-form'

export const metadata = { title: 'Create account · Imperial Cloud' }

export default function SignupPage() {
  return (
    <div
      className="w-full max-w-[440px] rounded-lg p-10 border"
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
        Create your account
      </h1>
      <p className="text-sm text-center mb-7" style={{ color: 'var(--ic-ws-text-2)' }}>
        Spin up an Imperial Cloud workspace in seconds.
      </p>
      {/*
        SignupForm calls useSearchParams() to read ?email= and ?next=. The
        Suspense wrapper lets Next 14 statically prerender the page shell;
        without it Vercel's export step fails for /signup.
      */}
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
      <p className="text-xs text-center mt-7" style={{ color: 'var(--ic-ws-text-2)' }}>
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-2" style={{ color: 'var(--ic-ws-brand-bright)' }}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
