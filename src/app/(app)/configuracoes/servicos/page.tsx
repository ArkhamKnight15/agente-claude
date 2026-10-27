import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { formatBRL } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/security/rbac";
import { listPackages } from "@/server/services/settings";
import { PackageDialog } from "./package-form";

export const metadata: Metadata = { title: "Preços e serviços" };

export default async function ServicesPage() {
  const user = await requireUser("settings:read");
  const packages = await listPackages();
  const canEdit = can(user.role, "settings:write");
  return (
    <>
      <PageHeader title="Preços e serviços" description="Defina preço, escopo, prazos e condições. O agente usa exatamente estes dados nas mensagens e propostas." actions={canEdit ? <PackageDialog /> : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        {packages.map((p) => (
          <Card key={p.id} className={p.active ? "" : "opacity-70"}>
            <CardHeader
              title={<span className="flex items-center gap-2">{p.name}{p.isDefault ? <Badge tone="accent">Padrão</Badge> : null}{!p.active ? <Badge>Inativo</Badge> : null}</span>}
              description={p.description}
              action={canEdit ? <PackageDialog pkg={p} /> : null}
            />
            <CardBody className="space-y-4">
              <p className="text-3xl font-semibold tracking-tight">{formatBRL(p.price)}</p>
              <p className="text-13 text-fg-3">{p.deliveryDays} dias úteis · {p.revisions} rodada(s) de ajustes</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ul className="space-y-1.5">{p.features.map((f) => <li key={f} className="flex gap-2 text-13"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="Incluído" />{f}</li>)}</ul>
                <ul className="space-y-1.5">{p.notIncluded.map((f) => <li key={f} className="flex gap-2 text-13 text-fg-3"><Minus className="mt-0.5 size-3.5 shrink-0" aria-label="Não incluído" />{f}</li>)}</ul>
              </div>
              <dl className="grid gap-2 border-t border-border pt-3 text-13">
                <div><dt className="text-xs text-fg-3">Pagamento</dt><dd>{p.paymentTerms}</dd></div>
                <div><dt className="text-xs text-fg-3">Suporte e manutenção</dt><dd>{p.supportTerms}</dd></div>
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
