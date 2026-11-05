export default function Carregando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-3" />
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
    </div>
  );
}
