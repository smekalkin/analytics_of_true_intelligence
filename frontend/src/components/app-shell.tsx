'use client';

import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

const NAV = [
  { href: '/dashboard', label: 'Дашборд', icon: '▦' },
  { href: '/branches', label: 'Филиалы', icon: '⌂' },
  { href: '/reviews', label: 'Отзывы', icon: '✎' },
  { href: '/sync', label: 'Импорт', icon: '⇅' },
];

const MOBILE_QUERY = '(max-width: 900px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return mobile;
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        ИИ
      </span>
      <span>
        Истинный интеллект
        <small>аналитика геосервисов</small>
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { carryQuery } = useFilters();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    burgerRef.current?.focus();
  }, []);

  // Закрываем меню при переходе на другую страницу и при переходе на десктопную ширину
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, [isMobile]);

  // Пока меню открыто: Esc закрывает, страница под ним не прокручивается, фокус — внутри меню
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const current = NAV.find((item) => pathname.startsWith(item.href));

  return (
    <div className="shell">
      <header className="mobile-bar">
        <button
          ref={burgerRef}
          type="button"
          className="icon-btn"
          aria-label="Открыть меню"
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => setOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="mobile-title">{current?.label ?? 'Истинный интеллект'}</span>
        <span className="brand-mark brand-mark-sm" aria-hidden>
          ИИ
        </span>
      </header>

      <div className={`backdrop ${open ? 'show' : ''}`} onClick={close} aria-hidden />

      <aside
        id="app-menu"
        ref={drawerRef}
        className={`sidebar ${open ? 'open' : ''}`}
        aria-label="Главное меню"
        // На мобильной ширине закрытое меню недоступно для клавиатуры и скринридеров
        inert={isMobile && !open ? true : undefined}
      >
        <div className="sidebar-head">
          <Brand />
          <button type="button" className="icon-btn drawer-close" aria-label="Закрыть меню" onClick={close}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              // Клиенту companyId не нужен (сервер всё равно ограничит его компанией); не переносим его,
              // чтобы ссылка с чужим companyId не «заражала» все разделы ошибкой 403
              href={`${item.href}${carryQuery(user?.role === 'client' ? { companyId: null } : {})}`}
              className={pathname.startsWith(item.href) ? 'active' : ''}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="user-box">
            <div className="user-name">{user.fullName}</div>
            <div className="user-meta">
              <span className={`badge ${user.role === 'admin' ? 'badge-accent' : ''}`}>
                {user.role === 'admin' ? 'Администратор' : 'Клиент'}
              </span>
              {user.companyName && <span className="muted">{user.companyName}</span>}
            </div>
            <button className="btn btn-ghost" onClick={logout}>
              Выйти
            </button>
          </div>
        )}
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
