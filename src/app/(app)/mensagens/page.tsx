import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, Inbox } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/session";
import { bulkApproveAction } from "@/server/actions/outreach";
import { db } from "@/server/db";
import { can } from "@/server/security/rbac";
import { integrationConfiguredFor, listMessages } from "@/server/services/messages";
import { getContactPolicy } from "@/server/services/settings";
import { toMessageView } from "@/server/views";
import { MessageList } from "./message-list";

export const metadata: Metadata = { title: "Central de mensagens" };

const BOXES = ["review", "approved", "sent", "inbox", "failed"] as const;
type Box = (typeof BOXES)[number];
const LABELS: Record<Box, string> = { review: "Para revisar", approved: "Aprovadas", sent: "Enviadas", inbox: "Respostas", failed: "Falhas" };
const EMPTY: Record<Box, string> = {
  review: "Nenhuma mensagem aguardando revisão. As campanhas colocam novas mensagens aqui.",
  approved: "Nenhuma mensagem aprovada aguardando envio.",
  sent: "Nenhuma mensagem enviada ainda.",
  inbox: "Nenhuma resposta recebida. Respostas chegam pelo webhook do WhatsApp e pela leitura do e-mail (IMAP).",
  failed: "Nenhuma falha de envio.",
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string; channel?: string; page?: string }> }) {
  const user = await requireUser("message:read");
  const sp = await searchParams;
  const box: Box = BOXES.includes(sp.box as Box) ? (sp.box as Box) : "review";
  const channel = sp.channel === "WHATSAPP" || sp.channel === "EMAIL" ? sp.channel : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [result, counts, policy] = await Promise.all([
    listMessages({ box, channel, page }),
    Promise.all(
      BOXES.map((b) =>
        db.message.count({
          where:
            b === "review" ? { direction: "OUTBOUND", status: "PENDING_APPROVAL" }
            : b === "approved" ? { direction: "OUTBOUND", status: { in: ["APPROVED", "QUEUED"] } }
            : b === "failed" ? { direction: "OUTBOUND", status: "FAILED" }
            : b === "inbox" ? { direction: "INBOUND", lead: { tasks: { some: { status: "OPEN", type: "REPLY" } } } }
            : { id: "__none__" },
        }),
      ),
    ),
    getContactPolicy(),
  ]);
  const integrations = { WHATSAPP: integrationConfiguredFor("WHATSAPP"), EMAIL: integrationConfiguredFor("EMAIL") };
  const qs = (extra: Record<string, string>) => `/mensagens?${new URLSearchParams({ box, ...(channel ? { channel } : {}), ...extra })}`;
  const items = result.items.map(toMessageView);

  return (
    <>
      <PageHeader
        title="Central de mensagens"
        description={`Modo de aprovação: ${policy.approvalMode === "MANUAL" ? "manual (toda mensagem precisa da sua aprovação)" : "automático apenas para e-mail"}. Limites: ${policy.dailyLimitWhatsapp} WhatsApp e ${policy.dailyLimitEmail} e-mails por dia, das ${policy.sendWindowStartHour}h às ${policy.sendWindowEndHour}h.`}
        actions={
          box === "review" && items.length > 1 && can(user.role, "message:approve") ? (
            <ActionButton
              action={bulkApproveAction.bind(null, items.map((m) => m.id))}
              confirm={{ title: `Aprovar ${items.length} mensagens?`, description: "Aprove em lote apenas depois de ler cada mensagem. Os envios continuam respeitando as regras de contato.", confirmLabel: "Aprovar todas" }}
            >
              <CheckCheck /> Aprovar todas desta página
            </ActionButton>
          ) : null
        }
      />

      {!integrations.WHATSAPP ? (
        <Alert tone="info" className="mb-4" title="WhatsApp oficial não configurado">
          Mensagens aprovadas podem ser enviadas manualmente: “Abrir no WhatsApp” abre a conversa no seu aplicativo com o texto pronto; depois, confirme o envio.{" "}
          <Link href="/integracoes" className="underline underline-offset-2">Configurar integração</Link>
        </Alert>
      ) : null}

      <Tabs current={box} items={BOXES.map((b, i) => ({ key: b, label: LABELS[b], href: `/mensagens?box=${b}${channel ? `&channel=${channel}` : ""}`, count: b === "sent" ? undefined : counts[i] }))} />

      <div className="my-4 flex gap-2 text-13" role="group" aria-label="Filtrar por canal">
        {[["", "Todos os canais"], ["WHATSAPP", "WhatsApp"], ["EMAIL", "E-mail"]].map(([value, label]) => (
          <Link
            key={value}
            href={`/mensagens?box=${box}${value ? `&channel=${value}` : ""}`}
            aria-current={(channel ?? "") === value ? "true" : undefined}
            className={(channel ?? "") === value ? "rounded-full bg-fg px-3 py-1 font-medium text-bg" : "rounded-full border border-border px-3 py-1 text-fg-2 hover:bg-surface-2"}
          >
            {label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <Card><EmptyState icon={Inbox} title={`Nada em “${LABELS[box]}”`} description={EMPTY[box]} /></Card>
      ) : (
        <>
          <MessageList items={items} integrations={integrations} canApprove={can(user.role, "message:approve")} canSend={can(user.role, "message:send")} />
          <Card className="mt-4">
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(p) => qs({ page: String(p) })} label="mensagens" />
          </Card>
        </>
      )}
    </>
  );
}
