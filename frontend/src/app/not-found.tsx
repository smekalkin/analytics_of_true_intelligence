import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1>Страница не найдена</h1>
        <p className="muted">Проверьте адрес или вернитесь на дашборд.</p>
        <Link className="btn" href="/dashboard">
          На дашборд
        </Link>
      </div>
    </div>
  );
}
