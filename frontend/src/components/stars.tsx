export function Stars({ value }: { value: number }) {
  return (
    <span className={`stars r${value}`} role="img" aria-label={`Оценка ${value} из 5`}>
      {'★★★★★'.slice(0, value)}
      <span className="stars-off">{'★★★★★'.slice(value)}</span>
    </span>
  );
}
