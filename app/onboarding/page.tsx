import { OnboardingForm } from './onboarding-form'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Create your workspace · Imperial Cloud' }

export default function OnboardingPage() {
  return (
    <div className="max-w-[460px] mx-auto py-16">
      <Card className="p-8">
        <h1
          className="text-xl font-display font-semibold mb-1"
          style={{ color: 'var(--ic-ws-text)' }}
        >
          Create your workspace
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--ic-ws-text-2)' }}>
          Workspaces are tenants in Imperial Cloud — each one is its own org
          with members, files, and 100 GB of storage to start.
        </p>
        <OnboardingForm />
      </Card>
    </div>
  )
}
