'use client';

import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/states';
import { useAuth } from '@/lib/auth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

/** Клиентский guard: без сессии — на /login с возвратом обратно. Сервер всё равно проверяет каждый запрос. */
export function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, initializing, sessionEnded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (initializing || user) return;
    // Явный выход — на чистую страницу входа: следующий пользователь не должен попасть
    // на адрес предыдущего (например, с companyId чужой компании)
    if (sessionEnded === 'logout') {
      router.replace('/login');
      return;
    }
    const back = `${pathname}${sp.size ? `?${sp.toString()}` : ''}`;
    const reason = sessionEnded === 'expired' ? '&reason=expired' : '';
    router.replace(`/login?next=${encodeURIComponent(back)}${reason}`);
  }, [initializing, user, sessionEnded, router, pathname, sp]);

  if (initializing || !user) return <Spinner label="Проверяем сессию…" />;
  return <AppShell>{children}</AppShell>;
}
