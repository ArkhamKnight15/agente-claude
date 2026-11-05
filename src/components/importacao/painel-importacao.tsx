"use client";

import { ClipboardPaste, Eye, FileUp, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { CartaoContato } from "@/components/contatos/cartao-contato";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { Selo } from "@/components/ui/selo";
import { STATUS, SITE, type Tom } from "@/data/status";
import { COLUNAS, MAX_LINHAS_IMPORTACAO } from "@/lib/importacao";
import { plural } from "@/lib/formato";
import { formatarTelefone } from "@/lib/telefone";
import { importarAcao, preverImportacaoAcao } from "@/server/acoes";
import type { ItemPrevia, PreviaImportacao } from "@/server/importacao";
import type { ConfigMensagem, Contato } from "@/types";

const EXEMPLO = `${COLUNAS.join(";")}
Barbearia do João;(19) 98000-0001;Campinas;SP;;Barbearia;Rua A, 10 - Centro;https://exemplo.com.br/pagina
Corte Fino;19 98000-0002;Campinas;SP;instagram.com/cortefino;Barbearia;;`;

const SITUACAO: Record<ItemPrevia["situacao"], { rotulo: string; tom: Tom }> = {
  nova: { rotulo: "Nova", tom: "sucesso" },
  existente: { rotulo: "Já salva", tom: "neutro" },
  ja_chamada: { rotulo: "Já chamada", tom: "info" },
  erro: { rotulo: "Erro", tom: "perigo" },
};

const ORDEM_SITE = { sem_site: 0, so_perfil: 1, com_site: 2 } as const;

export function PainelImportacao({ config }: { config: ConfigMensagem }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [importados, setImportados] = useState<{ previa: PreviaImportacao; contatos: Contato[] } | null>(null);
  const [erro, setErro] = useState<string>();
  const [prevendo, iniciarPrevia] = useTransition();
  const [importando, iniciarImportacao] = useTransition();

  const validas = previa ? previa.itens.length - previa.erros : 0;

  function verPrevia() {
    setErro(undefined);
    iniciarPrevia(async () => {
      const r = await preverImportacaoAcao(texto);
      if (r.ok) setPrevia(r.data);
      else {
        setPrevia(null);
        setErro(r.error);
      }
    });
  }

  function importar() {
    setErro(undefined);
    iniciarImportacao(async () => {
      const r = await importarAcao(texto);
      if (r.ok) setImportados(r.data);
      else setErro(r.error);
    });
  }

  function recomecar() {
    setTexto("");
    setPrevia(null);
    setImportados(null);
    setErro(undefined);
  }

  if (importados) {
    const paraChamar = importados.contatos.filter((c) => c.status === "novo").sort((a, b) => ORDEM_SITE[a.siteStatus] - ORDEM_SITE[b.siteStatus]);
    const jaChamadas = importados.contatos.length - paraChamar.length;
    return (
      <div className="space-y-5">
        <Aviso
          tipo="sucesso"
          titulo={`${plural(importados.contatos.length, "empresa importada", "empresas importadas")} (${plural(importados.previa.novas, "nova", "novas")})`}
          acao={
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" tamanho="sm" icone={<RotateCcw aria-hidden />} onClick={recomecar}>
                Importar outra lista
              </Botao>
              <Link href="/contatos" className="inline-flex h-8 items-center px-2 text-13 font-medium text-accent hover:underline">
                Ver todos os contatos
              </Link>
            </div>
          }
        >
          {jaChamadas ? `${plural(jaChamadas, "empresa você já tinha chamado e não aparece", "empresas você já tinha chamado e não aparecem")} abaixo.` : "Todas prontas para chamar."}
        </Aviso>
        {paraChamar.length ? (
          <>
            <h2 className="text-18 font-semibold">{plural(paraChamar.length, "empresa para chamar", "empresas para chamar")}</h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {paraChamar.map((c) => (
                <li key={c.id}>
                  <CartaoContato contato={c} config={config} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <label htmlFor={`${id}-lista`} className="text-15 font-semibold">
          Cole a lista de empresas
        </label>
        <p id={`${id}-ajuda`} className="mt-1 text-13 text-fg-3">
          Uma empresa por linha. Aceita a lista que o Claude monta, uma planilha copiada (Excel, Google Planilhas) ou CSV. Até {MAX_LINHAS_IMPORTACAO} linhas por vez.
        </p>
        <AreaTexto
          id={`${id}-lista`}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrevia(null);
          }}
          rows={9}
          placeholder={EXEMPLO}
          spellCheck={false}
          aria-describedby={`${id}-ajuda`}
          className="mt-3 font-mono sm:text-13"
        />
        <details className="mt-3 text-13 text-fg-2">
          <summary className="cursor-pointer font-medium text-accent hover:underline">Formato das colunas</summary>
          <div className="mt-2 space-y-1.5">
            <p>
              Com cabeçalho, as colunas podem vir em qualquer ordem. Sem cabeçalho, use esta ordem:{" "}
              <code className="font-mono text-12">{COLUNAS.join(" ; ")}</code>
            </p>
            <p>Obrigatórios: nome, cidade e UF. Telefone, site/Instagram, categoria, endereço e link da fonte são opcionais.</p>
          </div>
        </details>
        <div className="mt-4 flex flex-wrap gap-2">
          <Botao variante="primario" icone={<Eye aria-hidden />} carregando={prevendo} disabled={!texto.trim()} onClick={verPrevia}>
            Ver prévia
          </Botao>
          <Botao
            variante="secundario"
            icone={<ClipboardPaste aria-hidden />}
            onClick={async () => {
              try {
                setTexto(await navigator.clipboard.readText());
                setPrevia(null);
              } catch {
                setErro("Não foi possível ler a área de transferência. Toque e segure no campo e escolha Colar.");
              }
            }}
          >
            Colar
          </Botao>
        </div>
      </section>

      {erro ? (
        <Aviso tipo="erro" titulo="Não deu para importar">
          {erro}
        </Aviso>
      ) : null}

      {previa ? (
        <section aria-labelledby={`${id}-previa`} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id={`${id}-previa`} className="text-18 font-semibold">
                Prévia
              </h2>
              <p className="mt-0.5 text-13 text-fg-3">
                {[
                  plural(previa.novas, "nova", "novas"),
                  previa.existentes ? plural(previa.existentes, "já salva", "já salvas") : null,
                  previa.jaChamadas ? plural(previa.jaChamadas, "já chamada", "já chamadas") : null,
                  previa.erros ? plural(previa.erros, "com erro (ignorada)", "com erro (ignoradas)") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {previa.excedeu ? ` · só as primeiras ${MAX_LINHAS_IMPORTACAO} linhas` : ""}
              </p>
            </div>
            <Botao variante="primario" tamanho="lg" icone={<FileUp aria-hidden />} carregando={importando} disabled={validas === 0} onClick={importar} className="w-full sm:w-auto">
              {validas ? `Importar ${plural(validas, "empresa", "empresas")}` : "Nada para importar"}
            </Botao>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {previa.itens.map((item) => (
              <li key={item.linha} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-14 font-medium break-words">
                    <span className="mr-2 font-mono text-12 text-fg-3">L{item.linha}</span>
                    {item.nome}
                  </p>
                  <p className="text-13 text-fg-3">
                    {item.erro ? (
                      <span className="text-danger">{item.erro}</span>
                    ) : (
                      [`${item.cidade} - ${item.uf}`, item.telefone ? formatarTelefone(item.telefone) : null, ...item.avisos].filter(Boolean).join(" · ")
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.siteStatus ? (
                    <Selo tom={SITE[item.siteStatus].tom}>{item.siteStatus === "so_perfil" ? `Só ${item.siteRotulo ?? "perfil"}` : SITE[item.siteStatus].rotulo}</Selo>
                  ) : null}
                  <Selo tom={SITUACAO[item.situacao].tom}>
                    {item.situacao === "ja_chamada" && item.statusAtual ? STATUS[item.statusAtual].rotulo : SITUACAO[item.situacao].rotulo}
                  </Selo>
                </div>
              </li>
            ))}
          </ul>
          {/* No celular a lista é longa: repete o botão no fim para não precisar voltar ao topo. */}
          {previa.itens.length > 3 ? (
            <Botao variante="primario" tamanho="lg" icone={<FileUp aria-hidden />} carregando={importando} disabled={validas === 0} onClick={importar} className="w-full sm:hidden">
              {validas ? `Importar ${plural(validas, "empresa", "empresas")}` : "Nada para importar"}
            </Botao>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
