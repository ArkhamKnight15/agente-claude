import type { Metadata } from "next";
import { CheckCircle2, MailX } from "lucide-react";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { verifySignedToken } from "@/server/security/crypto";
import { hitRateLimit } from "@/server/security/rate-limit";
import { unsubscribeByToken } from "@/server/services/unsubscribe";

export const metadata: Metadata = { title: "Cancelar recebimento", robots: { index: false } };

async function confirm(token: string, formData: FormData) {
  "use server";
  void formData;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "anon";
  if (!(await hitRateLimit(`unsub:${ip}`, 60, 3600)).allowed) return;
  await unsubscribeByToken(token);
  const { redirect } = await import("next/navigation");
  redirect(`/descadastro/${token}?ok=1`);
}

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const done = (await searchParams).ok === "1";
  const valid = Boolean(verifySignedToken(token, "unsubscribe"));
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        {done ? (
          <>
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold">Pronto, você não receberá mais mensagens</h1>
            <p className="mt-2 text-sm text-fg-3">Seu contato foi removido das nossas campanhas. Obrigado pelo retorno.</p>
          </>
        ) : valid ? (
          <>
            <MailX className="mx-auto size-10 text-fg-3" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold">Deixar de receber mensagens?</h1>
            <p className="mt-2 text-sm text-fg-3">Confirme para não receber mais contatos comerciais sobre criação de sites.</p>
            <form action={confirm.bind(null, token)} className="mt-6">
              <Button type="submit" variant="primary" size="lg" className="w-full">Confirmar descadastro</Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Link inválido</h1>
            <p className="mt-2 text-sm text-fg-3">Responda ao e-mail com a palavra “sair” e removeremos seu contato.</p>
          </>
        )}
      </div>
    </main>
  );
}
