import "server-only";
import type { Contato, ContatoStatus, Empresa } from "@/types";
import { sql, transacao } from "./db";

/** Contatos salvos. O andamento (status, observação) nunca é sobrescrito por uma nova busca. */

interface Linha {
  id: string;
  nome: string;
  categoria: string | null;
  nicho: string | null;
  endereco: string | null;
  cidade: string;
  uf: string;
  telefone: string | null;
  telefone_tipo: Contato["telefoneTipo"];
  site_status: Contato["siteStatus"];
  site_url: string | null;
  site_rotulo: string | null;
  maps_url: string | null;
  avaliacao: number | null;
  avaliacoes: number | null;
  fonte: Contato["fonte"];
  origem_url: string | null;
  consultado_em: Date | null;
  excluido_em: Date | null;
  status: ContatoStatus;
  observacao: string | null;
  contatado_em: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

function paraContato(l: Linha): Contato {
  return {
    id: l.id,
    nome: l.nome,
    categoria: l.categoria,
    nicho: l.nicho,
    endereco: l.endereco,
    cidade: l.cidade,
    uf: l.uf,
    telefone: l.telefone,
    telefoneTipo: l.telefone_tipo,
    siteStatus: l.site_status,
    siteUrl: l.site_url,
    siteRotulo: l.site_rotulo,
    mapsUrl: l.maps_url,
    avaliacao: l.avaliacao,
    avaliacoes: l.avaliacoes,
    fonte: l.fonte,
    origemUrl: l.origem_url,
    consultadoEm: l.consultado_em?.toISOString() ?? null,
    status: l.status,
    observacao: l.observacao,
    contatadoEm: l.contatado_em?.toISOString() ?? null,
    criadoEm: l.criado_em.toISOString(),
    atualizadoEm: l.atualizado_em.toISOString(),
  };
}

/**
 * Salva as empresas encontradas. Quem já existe (mesmo id da fonte ou mesmo telefone)
 * mantém o andamento; os dados da fonte são atualizados só quando é o mesmo registro.
 */
export async function salvarEmpresas(empresas: Empresa[], nicho: string): Promise<{ contatos: Contato[]; novas: number; excluidas: number }> {
  if (empresas.length === 0) return { contatos: [], novas: 0, excluidas: 0 };
  return transacao(async (q) => {
    const telefones = empresas.map((e) => e.telefone).filter((t): t is string => Boolean(t));
    const existentes = await q<Linha>("SELECT * FROM prospecta_contatos WHERE id = ANY($1) OR telefone = ANY($2)", [empresas.map((e) => e.id), telefones]);
    const porId = new Map(existentes.map((l) => [l.id, l]));
    const porTelefone = new Map(existentes.filter((l) => l.telefone).map((l) => [l.telefone as string, l]));
    const resultado = new Map<string, Contato>();
    const excluidas = new Set<string>();
    let novas = 0;

    for (const e of empresas) {
      const mesmoRegistro = porId.get(e.id);
      const mesmoTelefone = e.telefone ? porTelefone.get(e.telefone) : undefined;
      let linha: Linha;
      if (mesmoRegistro?.excluido_em) {
        linha = mesmoRegistro;
      } else if (mesmoRegistro) {
        [linha] = await q<Linha>(
          `UPDATE prospecta_contatos SET nome = $2, categoria = $3, endereco = $4, telefone = COALESCE($5, telefone),
             telefone_tipo = CASE WHEN $5::text IS NULL THEN telefone_tipo ELSE $6 END, site_status = $7, site_url = $8,
             site_rotulo = $9, maps_url = $10, avaliacao = $11, avaliacoes = $12, origem_url = COALESCE($13, origem_url),
             consultado_em = COALESCE($14, consultado_em)
           WHERE id = $1 RETURNING *`,
          [e.id, e.nome, e.categoria, e.endereco, e.telefone, e.telefoneTipo, e.siteStatus, e.siteUrl, e.siteRotulo, e.mapsUrl, e.avaliacao, e.avaliacoes, e.origemUrl, e.consultadoEm],
        );
      } else if (mesmoTelefone) {
        linha = mesmoTelefone; // mesma empresa vinda de outra fonte ou com outro cadastro
      } else {
        [linha] = await q<Linha>(
          `INSERT INTO prospecta_contatos (id, nome, categoria, nicho, endereco, cidade, uf, telefone, telefone_tipo,
             site_status, site_url, site_rotulo, maps_url, avaliacao, avaliacoes, fonte, origem_url, consultado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
          [e.id, e.nome, e.categoria, nicho, e.endereco, e.cidade, e.uf, e.telefone, e.telefoneTipo, e.siteStatus, e.siteUrl, e.siteRotulo, e.mapsUrl, e.avaliacao, e.avaliacoes, e.fonte, e.origemUrl, e.consultadoEm],
        );
        novas++;
        porId.set(linha.id, linha);
        if (linha.telefone) porTelefone.set(linha.telefone, linha);
      }
      // Excluída por você: não volta para a lista (nem é atualizada).
      if (linha.excluido_em) excluidas.add(linha.id);
      else resultado.set(linha.id, paraContato(linha));
    }
    return { contatos: [...resultado.values()], novas, excluidas: excluidas.size };
  });
}

export interface FiltroContatos {
  status?: ContatoStatus;
  busca?: string;
}

export async function listarContatos(filtro: FiltroContatos = {}, limite = 300): Promise<Contato[]> {
  const condicoes: string[] = ["excluido_em IS NULL"];
  const parametros: unknown[] = [];
  if (filtro.status) {
    parametros.push(filtro.status);
    condicoes.push(`status = $${parametros.length}`);
  }
  const busca = filtro.busca?.trim();
  if (busca) {
    parametros.push(`%${busca}%`);
    const texto = `$${parametros.length}`;
    const digitos = busca.replace(/\D/g, "");
    if (digitos.length >= 4) {
      parametros.push(`%${digitos}%`);
      condicoes.push(`(nome ILIKE ${texto} OR cidade ILIKE ${texto} OR telefone LIKE $${parametros.length})`);
    } else {
      condicoes.push(`(nome ILIKE ${texto} OR cidade ILIKE ${texto})`);
    }
  }
  parametros.push(limite);
  const linhas = await sql<Linha>(
    `SELECT * FROM prospecta_contatos WHERE ${condicoes.join(" AND ")}
     ORDER BY atualizado_em DESC, nome LIMIT $${parametros.length}`,
    parametros,
  );
  return linhas.map(paraContato);
}

/** Contatos já salvos com algum destes ids ou telefones (para a prévia da importação). */
export async function contatosPorIdsOuTelefones(ids: string[], telefones: string[]): Promise<Array<Contato & { excluido: boolean }>> {
  if (ids.length === 0 && telefones.length === 0) return [];
  const linhas = await sql<Linha>("SELECT * FROM prospecta_contatos WHERE id = ANY($1) OR telefone = ANY($2)", [ids, telefones]);
  return linhas.map((l) => ({ ...paraContato(l), excluido: Boolean(l.excluido_em) }));
}

/** Estado atual de contatos já exibidos (para refletir o que foi feito em outro aparelho). */
export async function contatosPorIds(ids: string[]): Promise<{ contatos: Contato[]; excluidos: string[] }> {
  if (ids.length === 0) return { contatos: [], excluidos: [] };
  const linhas = await sql<Linha>("SELECT * FROM prospecta_contatos WHERE id = ANY($1)", [ids]);
  return {
    contatos: linhas.filter((l) => !l.excluido_em).map(paraContato),
    excluidos: linhas.filter((l) => l.excluido_em).map((l) => l.id),
  };
}

export type ContagemStatus = Record<ContatoStatus, number> & { total: number };

export async function contarPorStatus(): Promise<ContagemStatus> {
  const linhas = await sql<{ status: ContatoStatus; n: string }>("SELECT status, count(*) AS n FROM prospecta_contatos WHERE excluido_em IS NULL GROUP BY status");
  const contagem: ContagemStatus = { novo: 0, enviado: 0, respondeu: 0, fechado: 0, total: 0 };
  for (const l of linhas) {
    contagem[l.status] = Number(l.n);
    contagem.total += Number(l.n);
  }
  return contagem;
}

export async function atualizarContato(id: string, mudancas: { status?: ContatoStatus; observacao?: string | null }): Promise<Contato | null> {
  const [linha] = await sql<Linha>(
    `UPDATE prospecta_contatos SET
       status = COALESCE($2, status),
       observacao = CASE WHEN $3::boolean THEN $4 ELSE observacao END,
       contatado_em = CASE WHEN $2 = 'enviado' AND contatado_em IS NULL THEN now() ELSE contatado_em END,
       atualizado_em = now()
     WHERE id = $1 RETURNING *`,
    [id, mudancas.status ?? null, mudancas.observacao !== undefined, mudancas.observacao ?? null],
  );
  return linha ? paraContato(linha) : null;
}

/**
 * Exclui da sua lista. O registro fica guardado só para a empresa não voltar numa nova busca
 * ou importação (vale também para quem pediu para não receber mensagens).
 */
export async function excluirContato(id: string): Promise<boolean> {
  const linhas = await sql<{ id: string }>(
    "UPDATE prospecta_contatos SET excluido_em = now(), atualizado_em = now() WHERE id = $1 AND excluido_em IS NULL RETURNING id",
    [id],
  );
  return linhas.length > 0;
}
