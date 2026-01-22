import { createFileRoute } from '@tanstack/react-router';
import { Page } from '~/components/Page';
import { AppBreadcrumb } from '~/components/AppBreadcrumb';
import { assertAuthenticatedFn } from '~/fn/guards';
import { CommitmentsDashboard } from '~/components/CommitmentsDashboard';
import { Home, CheckCircle } from 'lucide-react';

export const Route = createFileRoute('/dashboard/commitments')({
  component: CommitmentsPage,
  beforeLoad: async () => {
    await assertAuthenticatedFn();
  },
});

function CommitmentsPage() {
  return (
    <Page>
      <AppBreadcrumb
        items={[
          { label: 'Dashboard', href: '/dashboard', icon: Home },
          { label: 'Commitments', icon: CheckCircle },
        ]}
      />

      <div className="mt-8 max-w-5xl">
        <CommitmentsDashboard />
      </div>
    </Page>
  );
}
