import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-13 font-medium text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 text-sm text-fg-3">O endereço pode ter mudado ou o registro foi removido.</p>
        <Link href="/" className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover">Ir para o dashboard</Link>
      </div>
    </main>
  );
}
