"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ORDEM_STATUS } from "@/data/status";
import type { BuscaResultado, ConfigMensagem, Contato, Resultado } from "@/types";
import { entrar, exigirLogin, sair } from "./auth";
import { executarBusca } from "./busca";
import { salvarConfig } from "./config";
import { atualizarContato } from "./contatos";
import { ErroDeUsuario, mensagemDeErro } from "./erros";

async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    console.error("[acao]", error instanceof Error ? error.message : error);
    return { ok: false, error: mensagemDeErro(error) };
  }
}

export interface EstadoLogin {
  erro?: string;
}

export async function entrarAcao(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const senha = String(form.get("senha") ?? "");
  if (!senha) return { erro: "Digite a senha." };
  const resultado = await executar(() => entrar(senha));
  if (!resultado.ok) return { erro: resultado.error };
  const destino = String(form.get("destino") ?? "/");
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function sairAcao(): Promise<void> {
  await sair();
  redirect("/login");
}

const buscaSchema = z.object({
  uf: z.string().length(2),
  cidade: z.string().trim().min(2).max(80),
  nicho: z.string().min(1).max(60),
  termo: z.string().trim().max(60).optional(),
  quantidade: z.number().int(),
  fonte: z.enum(["auto", "google", "osm"]),
});

export async function buscarAcao(input: z.input<typeof buscaSchema>): Promise<Resultado<BuscaResultado>> {
  return executar(async () => {
    await exigirLogin();
    const resultado = await executarBusca(buscaSchema.parse(input));
    revalidatePath("/contatos");
    return resultado;
  });
}

const mudancaSchema = z.object({
  status: z.enum(ORDEM_STATUS as [Contato["status"], ...Contato["status"][]]).optional(),
  observacao: z.string().max(2000).nullable().optional(),
});

export async function atualizarContatoAcao(id: string, mudancas: z.input<typeof mudancaSchema>): Promise<Resultado<Contato>> {
  return executar(async () => {
    await exigirLogin();
    const dados = mudancaSchema.parse(mudancas);
    const contato = await atualizarContato(z.string().min(3).max(200).parse(id), {
      ...dados,
      observacao: dados.observacao === undefined ? undefined : dados.observacao?.trim() || null,
    });
    if (!contato) throw new ErroDeUsuario("Contato não encontrado.");
    revalidatePath("/contatos");
    return contato;
  });
}

const configSchema = z.object({
  seuNome: z.string().trim().max(80),
  suaEmpresa: z.string().trim().max(80),
  preco: z.number().min(0).max(1_000_000),
  portfolio: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "O link precisa começar com https://"),
  modelo: z.string().trim().min(20, "A mensagem está curta demais.").max(2000),
});

export async function salvarConfigAcao(config: ConfigMensagem): Promise<Resultado<ConfigMensagem>> {
  return executar(async () => {
    await exigirLogin();
    const dados = configSchema.safeParse(config);
    if (!dados.success) throw new ErroDeUsuario(dados.error.issues[0]?.message ?? "Confira os campos.");
    await salvarConfig(dados.data);
    revalidatePath("/", "layout");
    return dados.data;
  });
}
