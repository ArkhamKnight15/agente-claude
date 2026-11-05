import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="text-13 font-medium text-fg-3">Erro 404</p>
      <h1 className="mt-2 text-22 font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-14 text-fg-3">O endereço pode ter mudado.</p>
      <Link href="/" className="mt-6 text-14 font-medium text-accent hover:underline">
        Voltar para a busca
      </Link>
    </main>
  );
}
