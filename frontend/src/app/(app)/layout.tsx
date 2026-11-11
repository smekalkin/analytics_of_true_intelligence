import { Suspense } from 'react';
import { Spinner } from '@/components/states';
import { ProtectedShell } from './protected-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}
