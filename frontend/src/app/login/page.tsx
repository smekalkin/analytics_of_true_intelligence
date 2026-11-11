'use client';

import { Spinner } from '@/components/states';
import { useAuth } from '@/lib/auth';
import { User } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';

const DEMO = [
  { email: 'admin@example.com', password: 'admin123', label: 'Администратор (все компании)' },
  { email: 'veter@example.com', password: 'client123', label: 'Клиент: Кофейня «Северный ветер»' },
  { email: 'gaika@example.com', password: 'client123', label: 'Клиент: Автосервис «Гайка»' },
  { email: 'ulybka@example.com', password: 'client123', label: 'Клиент: Стоматология «Улыбка+»' },
];

/**
 * Куда вернуть пользователя после входа. Разбираем `next` как URL относительно своего origin и
 * отбрасываем всё, что ведёт на другой хост (защита от open redirect вида `/\evil.example`).
 * Клиенту убираем companyId: ссылка могла остаться от другого пользователя.
 */
function resolveTarget(next: string | null, user: User): string {
  if (!next) return '/dashboard';
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return '/dashboard';
  }
  if (url.origin !== window.location.origin) return '/dashboard';
  if (user.role === 'client') url.searchParams.delete('companyId');
  return `${url.pathname}${url.search}`;
}

function LoginForm() {
  const { user, login, initializing } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next');
  const expired = sp.get('reason') === 'expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initializing && user) router.replace(resolveTarget(next, user));
  }, [initializing, user, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="center-page">
      <form className="card narrow login" onSubmit={onSubmit} noValidate>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden>
            ИИ
          </span>
          <span>
            Истинный интеллект
            <small>аналитический кабинет</small>
          </span>
        </div>
        <h1>Вход</h1>
        {expired && (
          <div className="notice" role="status">
            Сессия истекла — войдите снова, чтобы продолжить.
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-block" type="submit" disabled={submitting || !email || !password}>
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <div className="demo">
          <div className="muted">Демо-доступы (вымышленные данные):</div>
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              className="demo-item"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
                setError(null);
              }}
            >
              <span>{d.label}</span>
              <code>
                {d.email} / {d.password}
              </code>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginForm />
    </Suspense>
  );
}
