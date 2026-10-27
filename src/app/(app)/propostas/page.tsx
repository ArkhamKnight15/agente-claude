import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ProposalStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { PROPOSAL_STATUS_LABELS } from "@/data/labels";
import { formatBRL, formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listProposals, proposalCode } from "@/server/services/proposals";

export const metadata: Metadata = { title: "Propostas" };

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireUser("proposal:read");
  const sp = await searchParams;
  const status = Object.values(ProposalStatus).includes(sp.status as ProposalStatus) ? (sp.status as ProposalStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await listProposals({ status, page });
  return (
    <>
      <PageHeader title="Propostas comerciais" description="Crie propostas a partir da ficha do lead. Nenhuma proposta é enviada sem aprovação de um administrador." />
      <Tabs
        current={status ?? "all"}
        items={[{ key: "all", label: "Todas", href: "/propostas" }, ...Object.values(ProposalStatus).map((s) => ({ key: s, label: PROPOSAL_STATUS_LABELS[s].label, href: `/propostas?status=${s}` }))]}
      />
      <Card className="mt-4">
        {result.items.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma proposta" description="Abra um lead interessado e clique em “Criar proposta”." />
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr><Th>Proposta</Th><Th>Cliente</Th><Th>Status</Th><Th className="text-right">Valor</Th><Th>Validade</Th></tr>
                </THead>
                <TBody>
                  {result.items.map((p) => (
                    <Tr key={p.id}>
                      <Td><Link href={`/propostas/${p.id}`} className="font-medium hover:text-accent">{proposalCode(p.number)}</Link></Td>
                      <Td><Link href={`/leads/${p.lead.id}`} className="hover:text-accent">{p.lead.name}</Link><p className="text-xs text-fg-3">{p.lead.city}/{p.lead.state}</p></Td>
                      <Td><Badge tone={PROPOSAL_STATUS_LABELS[p.status].tone} dot>{PROPOSAL_STATUS_LABELS[p.status].label}</Badge></Td>
                      <Td className="text-right font-medium tabular-nums">{formatBRL(p.price)}</Td>
                      <Td className="text-fg-3">{formatDate(p.validUntil)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(n) => `/propostas?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`} label="propostas" />
          </>
        )}
      </Card>
    </>
  );
}
