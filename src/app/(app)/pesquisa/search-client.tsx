"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Download, ExternalLink, Globe, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { LocationFields } from "@/components/forms/location-fields";
import { NicheField } from "@/components/forms/niche-field";
import { classifyUrl } from "@/lib/url";
import { importBusinessesAction, searchBusinessesAction, type SearchResultItem } from "@/server/actions/outreach";

interface SearchData {
  items: SearchResultItem[];
  nextCursor: string | null;
  nicheKey: string;
  nicheLabel: string;
  city: string;
  state: string;
}

export function SearchClient({ sources }: { sources: Array<{ provider: string; label: string; configured: boolean }> }) {
  const [state, formAction, pending] = useActionState(searchBusinessesAction, {});
  const [selection, setSelection] = useState<{ at?: number; ids: Set<string> }>({ ids: new Set() });
  const [importing, startImport] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const data = state.ok ? (state.data as SearchData) : null;
  // Por padrão, ficam selecionadas as empresas que ainda não estão na base.
  const selected =
    selection.at === state.at ? selection.ids : new Set((data?.items ?? []).filter((i) => !i.existingLeadId).map((i) => i.externalId));

  useEffect(() => {
    if (state.ok === false && state.error) toast({ tone: "error", title: "Falha na pesquisa", description: state.error });
  }, [state, toast]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection({ at: state.at, ids: next });
  };

  const runImport = () => {
    if (!data) return;
    const items = data.items.filter((i) => selected.has(i.externalId));
    startImport(async () => {
      const result = await importBusinessesAction(items, { nicheKey: data.nicheKey, nicheLabel: data.nicheLabel, city: data.city, state: data.state });
      if (result.ok === false) toast({ tone: "error", title: "Falha ao importar", description: result.error });
      else {
        toast({ tone: "success", title: result.message ?? "Importado." });
        router.push("/leads?sort=recent");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <form action={formAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end" noValidate>
            <LocationFields errors={{ city: state.fieldErrors?.city?.[0] }} />
            <NicheField error={state.fieldErrors?.nicheKey?.[0]} />
            <Field label="Fonte" htmlFor="provider">
              <Select id="provider" name="provider" defaultValue={sources.find((s) => s.configured)?.provider}>
                {sources.map((s) => <option key={s.provider} value={s.provider} disabled={!s.configured}>{s.label}{s.configured ? "" : " (pendente)"}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="primary" loading={pending} disabled={!sources.some((s) => s.configured)}>
              <Search /> Pesquisar
            </Button>
          </form>
        </CardBody>
      </Card>

      {!sources.some((s) => s.configured) ? (
        <Alert tone="warning" title="Nenhuma fonte configurada">Configure o Google Places ou o OpenStreetMap em <Link href="/integracoes" className="underline">Integrações</Link>.</Alert>
      ) : null}

      {data ? (
        data.items.length === 0 ? (
          <Card><EmptyState icon={Search} title="Nenhuma empresa encontrada" description="Tente outro nicho, outra cidade ou outra fonte." /></Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <p className="text-13 text-fg-2">
                {data.items.length} resultado(s) · {data.items.filter((i) => i.existingLeadId).length} já na base · {selected.size} selecionado(s)
              </p>
              <Button variant="primary" size="sm" onClick={runImport} loading={importing} disabled={selected.size === 0}>
                <Download /> Importar e verificar sites
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {data.items.map((item) => {
                const site = item.website ? classifyUrl(item.website) : null;
                return (
                  <li key={item.externalId} className="flex gap-3 px-5 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--accent)]"
                      checked={selected.has(item.externalId)}
                      onChange={() => toggle(item.externalId)}
                      disabled={Boolean(item.existingLeadId)}
                      aria-label={`Selecionar ${item.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {item.name}
                        {item.existingLeadId ? <Link href={`/leads/${item.existingLeadId}`}><Badge tone="info">Já na base</Badge></Link> : null}
                        {item.businessStatus === "CLOSED_PERMANENTLY" ? <Badge tone="danger">Fechada</Badge> : null}
                      </p>
                      <p className="text-xs text-fg-3">{item.category ?? "—"} · {item.address ?? "endereço não informado"}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
                        <span className="inline-flex items-center gap-1"><Phone className="size-3" aria-hidden />{item.phone ?? "telefone não encontrado"}</span>
                        <span className="inline-flex items-center gap-1">
                          <Globe className="size-3" aria-hidden />
                          {item.website ? `${site?.kind === "own_domain" ? "Site" : site?.label ?? "Link"}: ${item.website.replace(/^https?:\/\//, "").slice(0, 50)}` : item.hasWebsiteField ? "sem site no perfil" : "site não informado"}
                        </span>
                        {item.instagram ? <span className="inline-flex items-center gap-1"><AtSign className="size-3" aria-hidden />Instagram</span> : null}
                        {item.reviewCount !== null ? <span>{item.reviewCount} avaliações{item.rating ? ` · ${item.rating.toFixed(1)}` : ""}</span> : null}
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-accent hover:underline">
                            fonte <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-border px-5 py-3 text-xs text-fg-3">
              A verificação de site (com busca web e evidências) acontece após a importação. Dados do OpenStreetMap © colaboradores do OpenStreetMap (ODbL).
            </p>
          </Card>
        )
      ) : null}
    </div>
  );
}
