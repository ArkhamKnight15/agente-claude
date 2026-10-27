import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { ROLE_LABELS } from "@/data/labels";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";
import { EditUserButton, NewUserButton } from "./users-client";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  await requireUser("user:manage");
  const users = await listUsers();
  return (
    <>
      <PageHeader title="Usuários e permissões" description="Cada pessoa tem acesso limitado ao seu papel. Todas as ações relevantes ficam registradas na auditoria." actions={<NewUserButton />} />
      <Card>
        <TableContainer>
          <Table>
            <THead><tr><Th>Nome</Th><Th>Papel</Th><Th>Status</Th><Th>Último acesso</Th><Th><span className="sr-only">Ações</span></Th></tr></THead>
            <TBody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td><p className="font-medium">{u.name}</p><p className="text-xs text-fg-3">{u.email}</p></Td>
                  <Td><Badge tone={ROLE_LABELS[u.role].tone}>{ROLE_LABELS[u.role].label}</Badge></Td>
                  <Td>{u.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>}</Td>
                  <Td className="text-fg-3">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}</Td>
                  <Td className="text-right"><EditUserButton user={u} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </Card>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.values(ROLE_LABELS).map((r) => (
          <div key={r.label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-13 font-medium">{r.label}</dt>
            <dd className="mt-1 text-xs text-fg-3">{r.description}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
