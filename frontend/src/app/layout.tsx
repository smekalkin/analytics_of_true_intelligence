import { AuthProvider } from '@/lib/auth';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Истинный интеллект — аналитика',
  description: 'Аналитический кабинет: показатели филиалов на геосервисах',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
