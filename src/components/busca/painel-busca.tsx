"use client";

import { Search, SearchX } from "lucide-react";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { CartaoContato } from "@/components/contatos/cartao-contato";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, descritoPor, Entrada, Selecao } from "@/components/ui/campo";
import { Vazio } from "@/components/ui/vazio";
import { ESTADOS } from "@/data/estados";
import { NICHO_OUTRO, NICHOS } from "@/data/nichos";
import { plural } from "@/lib/formato";
import { normalizarTexto } from "@/lib/texto";
import { buscarAcao } from "@/server/acoes";
import type { BuscaResultado, ConfigMensagem, FonteEscolhida } from "@/types";

interface Filtros {
  uf: string;
  cidade: string;
  nicho: string;
  termo: string;
  quantidade: number;
  fonte: FonteEscolhida;
}

const PADRAO: Filtros = { uf: "SP", cidade: "", nicho: NICHOS[0].chave, termo: "", quantidade: 20, fonte: "auto" };
const CHAVE_LOCAL = "prospecta:ultima-busca";

function lerUltimaBusca(): Filtros {
  try {
    const salvo = localStorage.getItem(CHAVE_LOCAL);
    return salvo ? { ...PADRAO, ...(JSON.parse(salvo) as Partial<Filtros>) } : PADRAO;
  } catch {
    return PADRAO;
  }
}

interface Props {
  config: ConfigMensagem;
  googleDisponivel: boolean;
  limiteGoogle: number;
  usadasHoje: number;
}

export function PainelBusca({ config, googleDisponivel, limiteGoogle, usadasHoje }: Props) {
  const id = useId();
  const [filtros, setFiltros] = useState<Filtros>(PADRAO);
  const [cidades, setCidades] = useState<{ uf: string; nomes: string[] }>({ uf: "", nomes: [] });
  const [erroCidade, setErroCidade] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [resultado, setResultado] = useState<BuscaResultado | null>(null);
  const [mostrarComSite, setMostrarComSite] = useState(false);
  const [buscando, iniciar] = useTransition();
  const [consultasHoje, setConsultasHoje] = useState(usadasHoje);

  // Última busca deste aparelho (comodidade; os contatos ficam no banco). Lida depois da
  // hidratação porque o servidor não conhece o armazenamento local do navegador.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setFiltros(lerUltimaBusca()), []);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/cidades/${filtros.uf}`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((nomes) => ativo && setCidades({ uf: filtros.uf, nomes }))
      .catch(() => ativo && setCidades({ uf: filtros.uf, nomes: [] }));
    return () => {
      ativo = false;
    };
  }, [filtros.uf]);

  const fonteEfetiva = filtros.fonte === "auto" ? (googleDisponivel ? "google" : "osm") : filtros.fonte;
  const consultasPrevistas = fonteEfetiva === "google" ? filtros.quantidade / 20 : 0;

  function alterar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((atual) => ({ ...atual, [campo]: valor, ...(campo === "uf" ? { cidade: "" } : {}) }));
    if (campo === "cidade" || campo === "uf") setErroCidade(undefined);
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setErro(undefined);
    const cidadesCarregadas = cidades.uf === filtros.uf && cidades.nomes.length > 0;
    const oficial = cidades.nomes.find((n) => normalizarTexto(n) === normalizarTexto(filtros.cidade));
    if (!filtros.cidade.trim()) return setErroCidade("Digite a cidade.");
    if (cidadesCarregadas && !oficial) return setErroCidade(`Não encontramos essa cidade em ${filtros.uf}. Escolha uma da lista.`);
    if (filtros.nicho === NICHO_OUTRO && filtros.termo.trim().length < 2) return setErro("Digite o tipo de empresa que você procura.");

    const busca = { ...filtros, cidade: oficial ?? filtros.cidade };
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(busca));
    } catch {
      // Navegador sem armazenamento local: só não lembra a última busca.
    }
    iniciar(async () => {
      const r = await buscarAcao({ ...busca, termo: busca.nicho === NICHO_OUTRO ? busca.termo : undefined });
      if (r.ok) {
        setResultado(r.data);
        if (r.data.fonte === "google") setConsultasHoje((n) => n + r.data.consultas);
      } else {
        setErro(r.error);
      }
    });
  }

  const oportunidades = resultado?.contatos.filter((c) => c.siteStatus !== "com_site") ?? [];
  const comSite = resultado?.contatos.filter((c) => c.siteStatus === "com_site") ?? [];
  const visiveis = mostrarComSite ? (resultado?.contatos ?? []) : oportunidades;

  return (
    <div className="space-y-6">
      <form onSubmit={buscar} noValidate className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6" aria-describedby={`${id}-ajuda`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[190px_minmax(0,1.3fr)_minmax(0,1.2fr)_120px]">
          <Campo id={`${id}-uf`} rotulo="Estado">
            <Selecao id={`${id}-uf`} value={filtros.uf} onChange={(e) => alterar("uf", e.target.value)}>
              {ESTADOS.map((e) => (
                <option key={e.uf} value={e.uf}>
                  {e.uf} — {e.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id={`${id}-cidade`} rotulo="Cidade" erro={erroCidade}>
            <Entrada
              id={`${id}-cidade`}
              list={`${id}-cidades`}
              value={filtros.cidade}
              onChange={(e) => alterar("cidade", e.target.value)}
              placeholder="Ex.: Campinas"
              autoComplete="off"
              required
              aria-invalid={Boolean(erroCidade) || undefined}
              aria-describedby={descritoPor(`${id}-cidade`, erroCidade)}
            />
            <datalist id={`${id}-cidades`}>
              {cidades.uf === filtros.uf ? cidades.nomes.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  )) : null}
            </datalist>
          </Campo>
          <Campo id={`${id}-nicho`} rotulo="Tipo de empresa">
            <Selecao id={`${id}-nicho`} value={filtros.nicho} onChange={(e) => alterar("nicho", e.target.value)}>
              {NICHOS.map((n) => (
                <option key={n.chave} value={n.chave}>
                  {n.nome}
                </option>
              ))}
              <option value={NICHO_OUTRO}>Outro (digitar)</option>
            </Selecao>
          </Campo>
          <Campo id={`${id}-qtd`} rotulo="Quantidade">
            <Selecao id={`${id}-qtd`} value={filtros.quantidade} onChange={(e) => alterar("quantidade", Number(e.target.value))}>
              {[20, 40, 60].map((q) => (
                <option key={q} value={q}>
                  Até {q}
                </option>
              ))}
            </Selecao>
          </Campo>
          {filtros.nicho === NICHO_OUTRO ? (
            <Campo id={`${id}-termo`} rotulo="Qual tipo de empresa?" className="sm:col-span-2 lg:col-span-2">
              <Entrada id={`${id}-termo`} value={filtros.termo} onChange={(e) => alterar("termo", e.target.value)} placeholder="Ex.: floricultura" maxLength={60} />
            </Campo>
          ) : null}
          <Campo id={`${id}-fonte`} rotulo="Onde buscar" className={filtros.nicho === NICHO_OUTRO ? "sm:col-span-2 lg:col-span-2" : "sm:col-span-2 lg:col-span-4 lg:max-w-sm"}>
            <Selecao id={`${id}-fonte`} value={filtros.fonte} onChange={(e) => alterar("fonte", e.target.value as FonteEscolhida)}>
              <option value="auto">Automático ({googleDisponivel ? "Google" : "OpenStreetMap"})</option>
              <option value="google" disabled={!googleDisponivel}>
                Google Places{googleDisponivel ? "" : " (não configurado)"}
              </option>
              <option value="osm">OpenStreetMap (gratuito)</option>
            </Selecao>
          </Campo>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p id={`${id}-ajuda`} className="text-13 text-fg-3">
            {fonteEfetiva === "google"
              ? `Usa até ${plural(consultasPrevistas, "consulta", "consultas")} do Google · hoje: ${consultasHoje}${limiteGoogle ? ` de ${limiteGoogle}` : ""}`
              : "OpenStreetMap: gratuito, mas com menos empresas cadastradas. Pode levar até 1 minuto."}
          </p>
          <Botao type="submit" variante="primario" tamanho="lg" carregando={buscando} icone={<Search aria-hidden />} className="w-full sm:w-auto">
            {buscando ? "Buscando…" : "Buscar empresas"}
          </Botao>
        </div>
      </form>

      {erro ? (
        <Aviso
          tipo="erro"
          titulo="A busca não funcionou"
          acao={
            fonteEfetiva === "google" ? (
              <Botao variante="secundario" tamanho="sm" onClick={() => alterar("fonte", "osm")}>
                Usar o OpenStreetMap
              </Botao>
            ) : null
          }
        >
          {erro}
        </Aviso>
      ) : null}

      <section aria-live="polite" aria-busy={buscando} aria-label="Resultados da busca" className="space-y-4">
        {buscando ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        ) : resultado ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-18 font-semibold">{plural(oportunidades.length, "oportunidade", "oportunidades")} em {resultado.contatos[0]?.cidade ?? filtros.cidade}</h2>
                <p className="mt-0.5 text-13 text-fg-3">
                  {[
                    `${plural(resultado.recebidas, "empresa recebida", "empresas recebidas")} do ${resultado.fonte === "google" ? "Google" : "OpenStreetMap"}`,
                    resultado.novas ? plural(resultado.novas, "nova", "novas") : "nenhuma nova",
                    resultado.foraDaCidade ? plural(resultado.foraDaCidade, "de outra cidade (ignorada)", "de outras cidades (ignoradas)") : null,
                    resultado.fechadas ? plural(resultado.fechadas, "fechada (ignorada)", "fechadas (ignoradas)") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {comSite.length ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-14 text-fg-2">
                  <input type="checkbox" checked={mostrarComSite} onChange={(e) => setMostrarComSite(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  Mostrar também quem já tem site ({comSite.length})
                </label>
              ) : null}
            </div>
            {visiveis.length ? (
              <ul className="grid gap-3 lg:grid-cols-2">
                {visiveis.map((c) => (
                  <li key={c.id}>
                    <CartaoContato contato={c} config={config} />
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio icone={<SearchX />} titulo="Nenhuma empresa sem site nesta busca">
                {resultado.contatos.length
                  ? "Todas as empresas encontradas já têm site. Tente outro tipo de empresa ou outra cidade."
                  : "A fonte não trouxe empresas para esta cidade e tipo. Tente outro termo, outra cidade ou outra fonte."}
              </Vazio>
            )}
          </>
        ) : (
          <Vazio icone={<Search />} titulo="Escolha a cidade e o tipo de empresa">
            O resultado mostra primeiro quem não tem site, com a mensagem pronta para enviar pelo WhatsApp.
          </Vazio>
        )}
      </section>
    </div>
  );
}
