"use client";

import { RotateCcw, Save } from "lucide-react";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { useNotificar } from "@/components/ui/notificacoes";
import { MODELO_PADRAO, montarMensagem, VARIAVEIS } from "@/lib/mensagem";
import { salvarConfigAcao } from "@/server/acoes";
import type { ConfigMensagem, Empresa } from "@/types";

const EXEMPLO: Pick<Empresa, "nome" | "cidade" | "siteStatus" | "siteRotulo"> = {
  nome: "Barbearia do João",
  cidade: "Campinas",
  siteStatus: "so_perfil",
  siteRotulo: "Instagram",
};

export function FormularioMensagem({ inicial }: { inicial: ConfigMensagem }) {
  const id = useId();
  const [config, setConfig] = useState(inicial);
  const [precoTexto, setPrecoTexto] = useState(inicial.preco ? String(inicial.preco).replace(".", ",") : "");
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();
  const notificar = useNotificar();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const alterado = JSON.stringify(config) !== JSON.stringify(inicial);

  function alterar<K extends keyof ConfigMensagem>(campo: K, valor: ConfigMensagem[K]) {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
    setErro(undefined);
  }

  function inserirVariavel(nome: string) {
    const area = areaRef.current;
    const trecho = `{${nome}}`;
    if (!area) return alterar("modelo", `${config.modelo}${trecho}`);
    const inicio = area.selectionStart ?? config.modelo.length;
    const fim = area.selectionEnd ?? inicio;
    alterar("modelo", config.modelo.slice(0, inicio) + trecho + config.modelo.slice(fim));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    });
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    iniciar(async () => {
      const r = await salvarConfigAcao(config);
      if (r.ok) notificar("Mensagem salva. Vale para o computador e o celular.");
      else {
        setErro(r.error);
        notificar(r.error, "erro");
      }
    });
  }

  return (
    <form onSubmit={salvar} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" noValidate>
      <div className="space-y-6">
        <fieldset className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <legend className="sr-only">Seus dados</legend>
          <h2 className="text-15 font-semibold">Seus dados</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Campo id={`${id}-nome`} rotulo="Seu nome">
              <Entrada id={`${id}-nome`} value={config.seuNome} onChange={(e) => alterar("seuNome", e.target.value)} placeholder="Ex.: Ana" maxLength={80} autoComplete="name" />
            </Campo>
            <Campo id={`${id}-empresa`} rotulo="Sua empresa">
              <Entrada id={`${id}-empresa`} value={config.suaEmpresa} onChange={(e) => alterar("suaEmpresa", e.target.value)} placeholder="Ex.: Ana Sites" maxLength={80} autoComplete="organization" />
            </Campo>
            <Campo id={`${id}-preco`} rotulo="Preço inicial (R$)" dica="Deixe vazio para não citar preço.">
              <Entrada
                id={`${id}-preco`}
                inputMode="decimal"
                value={precoTexto}
                onChange={(e) => {
                  const limpo = e.target.value.replace(/[^\d,]/g, "");
                  setPrecoTexto(limpo);
                  alterar("preco", Number(limpo.replace(",", ".")) || 0);
                }}
                placeholder="500"
                aria-describedby={`${id}-preco-dica`}
              />
            </Campo>
            <Campo id={`${id}-portfolio`} rotulo="Link dos seus trabalhos" dica="Opcional. Sem link, a linha some da mensagem.">
              <Entrada
                id={`${id}-portfolio`}
                type="url"
                inputMode="url"
                value={config.portfolio}
                onChange={(e) => alterar("portfolio", e.target.value)}
                placeholder="https://"
                aria-describedby={`${id}-portfolio-dica`}
              />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <legend className="sr-only">Texto da mensagem</legend>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-15 font-semibold">Texto da mensagem</h2>
            <Botao variante="fantasma" tamanho="sm" icone={<RotateCcw aria-hidden />} onClick={() => alterar("modelo", MODELO_PADRAO)} disabled={config.modelo === MODELO_PADRAO}>
              Restaurar padrão
            </Botao>
          </div>
          <label htmlFor={`${id}-modelo`} className="sr-only">
            Modelo da mensagem
          </label>
          <AreaTexto id={`${id}-modelo`} ref={areaRef} value={config.modelo} onChange={(e) => alterar("modelo", e.target.value)} rows={10} className="mt-3" maxLength={2000} />
          <p className="mt-3 text-12 text-fg-3">Toque para inserir uma variável. Ela é trocada pelos dados de cada empresa.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {VARIAVEIS.map((v) => (
              <li key={v.nome}>
                <button
                  type="button"
                  onClick={() => inserirVariavel(v.nome)}
                  title={v.descricao}
                  className="h-7 rounded-md border border-border-strong bg-surface-2 px-2 font-mono text-12 text-fg-2 hover:border-accent hover:text-accent"
                >
                  {`{${v.nome}}`}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section aria-labelledby={`${id}-previa`} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 id={`${id}-previa`} className="text-15 font-semibold">
            Prévia
          </h2>
          <p className="mt-1 text-13 text-fg-3">
            Exemplo com “{EXEMPLO.nome}”, que só tem {EXEMPLO.siteRotulo}.
          </p>
          <div className="mt-4 rounded-2xl rounded-tl-sm bg-[#d9fdd3] px-4 py-3 text-14 leading-relaxed whitespace-pre-wrap text-[#111b21] shadow-sm">
            {montarMensagem(config.modelo, EXEMPLO, config) || "A mensagem está vazia."}
          </div>
        </section>
        {erro ? (
          <p role="alert" className="text-14 text-danger">
            {erro}
          </p>
        ) : null}
        <Botao type="submit" variante="primario" tamanho="lg" carregando={salvando} icone={<Save aria-hidden />} disabled={!alterado} className="w-full">
          {alterado ? "Salvar mensagem" : "Tudo salvo"}
        </Botao>
      </div>
    </form>
  );
}
