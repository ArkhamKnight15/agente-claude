import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Download, Filter, Search } from "lucide-react";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { PriorityBadge, StageBadge, WebsiteBadge } from "@/components/shared/status-badges";
import { BRAZIL_STATES } from "@/data/locations-states";
import { NICHES, getNiche } from "@/data/niches";
import { PRIORITY_LABELS, STAGE_LABELS, STAGE_ORDER, WEBSITE_STATUS_LABELS } from "@/data/labels";
import { formatPhone } from "@/lib/phone";
import { formatRelative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/security/rbac";
import { listLeads } from "@/server/services/leads";
import { parseLeadFilters } from "@/lib/lead-filters";

export const metadata: Metadata = { title: "Leads" };

const selectClass =
  "h-9 rounded-lg border border-border bg-surface px-2.5 text-13 text-fg shadow-xs focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("lead:read");
  const filters = parseLeadFilters(await searchParams);
  const result = await listLeads(filters);
  const params = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v !== undefined && k !== "page").map(([k, v]) => [k, String(v)]));
  const hrefFor = (page: number) => `/leads?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page) })}`;
  const hasFilters = params.toString().length > 0;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Empresas encontradas, com verificação de site, pontuação e etapa no funil."
        actions={
          can(user.role, "lead:export") ? (
            <a href={`/api/leads/export?${params}`} className={buttonClasses("secondary")} download>
              <Download className="size-4" /> Exportar CSV
            </a>
          ) : null
        }
      />

      <Card>
        <search>
        <form method="get" className="flex flex-wrap items-end gap-2 border-b border-border p-4" aria-label="Filtrar leads">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <label htmlFor="q" className="sr-only">Buscar por nome ou telefone</label>
            <input id="q" name="q" defaultValue={filters.q} placeholder="Nome, telefone ou e-mail" className={`${selectClass} w-full pl-9`} />
          </div>
          <label className="sr-only" htmlFor="f-state">Estado</label>
          <select id="f-state" name="state" defaultValue={filters.state ?? ""} className={selectClass}>
            <option value="">Todos os estados</option>
            {BRAZIL_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-city">Cidade</label>
          <input id="f-city" name="city" defaultValue={filters.city} placeholder="Cidade" className={`${selectClass} w-36`} />
          <label className="sr-only" htmlFor="f-niche">Nicho</label>
          <select id="f-niche" name="niche" defaultValue={filters.niche ?? ""} className={selectClass}>
            <option value="">Todos os nichos</option>
            {NICHES.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-priority">Prioridade</label>
          <select id="f-priority" name="priority" defaultValue={filters.priority ?? ""} className={selectClass}>
            <option value="">Toda prioridade</option>
            {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-stage">Etapa</label>
          <select id="f-stage" name="stage" defaultValue={filters.stage ?? ""} className={selectClass}>
            <option value="">Todas as etapas</option>
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s].label}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-site">Situação do site</label>
          <select id="f-site" name="websiteStatus" defaultValue={filters.websiteStatus ?? ""} className={selectClass}>
            <option value="">Qualquer site</option>
            {Object.entries(WEBSITE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-sort">Ordenar</label>
          <select id="f-sort" name="sort" defaultValue={filters.sort ?? "score"} className={selectClass}>
            <option value="score">Maior pontuação</option>
            <option value="recent">Mais recentes</option>
            <option value="lastContact">Último contato</option>
            <option value="name">Nome (A–Z)</option>
          </select>
          {filters.campaignId ? <input type="hidden" name="campaignId" value={filters.campaignId} /> : null}
          <button type="submit" className={buttonClasses("primary")}>
            <Filter className="size-4" /> Filtrar
          </button>
          {hasFilters ? <Link href="/leads" className={buttonClasses("ghost")}>Limpar</Link> : null}
        </form>
        </search>

        {result.items.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={hasFilters ? "Nenhum lead com esses filtros" : "Nenhum lead ainda"}
            description={hasFilters ? "Ajuste ou limpe os filtros." : "Crie uma campanha ou use a pesquisa de empresas para encontrar leads."}
            action={!hasFilters ? <ButtonLink href="/campanhas/nova" variant="primary">Nova campanha</ButtonLink> : null}
          />
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <Th>Empresa</Th>
                    <Th>Contato</Th>
                    <Th>Site</Th>
                    <Th>Prioridade</Th>
                    <Th>Etapa</Th>
                    <Th>Atualizado</Th>
                  </tr>
                </THead>
                <TBody>
                  {result.items.map((lead) => (
                    <Tr key={lead.id}>
                      <Td className="max-w-72">
                        <Link href={`/leads/${lead.id}`} className="block truncate font-medium text-fg hover:text-accent">
                          {lead.name}
                        </Link>
                        <p className="truncate text-xs text-fg-3">
                          {getNiche(lead.nicheKey)?.label ?? lead.category ?? "—"} · {lead.city}/{lead.state}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-fg-2">
                        {lead.phoneE164 ? formatPhone(lead.phoneE164) : lead.email ?? <span className="text-fg-3">sem contato</span>}
                      </Td>
                      <Td><WebsiteBadge status={lead.websiteStatus} confidence={lead.websiteConfidence} /></Td>
                      <Td><PriorityBadge priority={lead.priority} score={lead.score} /></Td>
                      <Td><StageBadge stage={lead.stage} /></Td>
                      <Td className="whitespace-nowrap text-fg-3">{formatRelative(lead.updatedAt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={hrefFor} label="leads" />
          </>
        )}
      </Card>
    </>
  );
}
