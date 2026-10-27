import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Acesso restrito" };

export default function NoPermissionPage() {
  return (
    <Card>
      <EmptyState
        icon={ShieldAlert}
        title="Você não tem permissão para acessar esta área"
        description="Peça a um administrador para ajustar o seu papel de acesso, se necessário."
        action={<ButtonLink href="/">Voltar ao dashboard</ButtonLink>}
      />
    </Card>
  );
}
