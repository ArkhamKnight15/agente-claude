export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-surface-3" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-3/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 rounded-xl border border-border bg-surface" />)}
      </div>
      <div className="h-80 rounded-xl border border-border bg-surface" />
    </div>
  );
}
