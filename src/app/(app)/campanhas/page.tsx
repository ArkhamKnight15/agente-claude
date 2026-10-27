import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination, ProgressBar } from "@/components/ui/misc";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { CampaignStatusBadge } from "@/components/shared/status-badges";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/security/rbac";
import { listCampaigns, readProgress } from "@/server/services/campaigns";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("campaign:read");
  const page = Number((await searchParams).page ?? 1) || 1;
  const { items, total, pageCount } = await listCampaigns(page);
  const canWrite = can(user.role, "campaign:write");
  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Cada campanha pesquisa uma cidade e um nicho, verifica os sites e prepara as abordagens."
        actions={canWrite ? <ButtonLink href="/campanhas/nova" variant="primary"><Plus /> Nova campanha</ButtonLink> : null}
      />
      <AutoRefresh active={items.some((c) => c.status === "RUNNING")} seconds={6} />
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha ainda"
            description="Escolha cidade, nicho e quantidade de empresas. O agente faz o resto e deixa tudo pronto para sua revisão."
            action={canWrite ? <ButtonLink href="/campanhas/nova" variant="primary"><Plus /> Criar primeira campanha</ButtonLink> : null}
          />
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <Th>Campanha</Th>
                    <Th>Status</Th>
                    <Th className="min-w-40">Progresso</Th>
                    <Th className="text-right">Leads</Th>
                    <Th className="text-right">Mensagens</Th>
                    <Th>Criada em</Th>
                  </tr>
                </THead>
                <TBody>
                  {items.map((c) => {
                    const p = readProgress(c);
                    return (
                      <Tr key={c.id}>
                        <Td>
                          <Link href={`/campanhas/${c.id}`} className="font-medium text-fg hover:text-accent">
                            {c.name}
                          </Link>
                          <p className="text-xs text-fg-3">{c.nicheLabel} · {c.city}/{c.state}</p>
                        </Td>
                        <Td><CampaignStatusBadge status={c.status} /></Td>
                        <Td>
                          <ProgressBar value={p.linked} max={c.targetCount} label={`Progresso de ${c.name}`} />
                          <p className="mt-1 text-xs text-fg-3 tabular-nums">{p.linked} de {c.targetCount} empresas</p>
                        </Td>
                        <Td className="text-right tabular-nums">{c._count.leads}</Td>
                        <Td className="text-right tabular-nums">{c._count.messages}</Td>
                        <Td className="whitespace-nowrap text-fg-3">{formatDateTime(c.createdAt)}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination page={page} pageCount={pageCount} total={total} hrefFor={(p) => `/campanhas?page=${p}`} label="campanhas" />
          </>
        )}
      </Card>
    </>
  );
}
