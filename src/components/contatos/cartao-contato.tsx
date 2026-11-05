"use client";

import {
  AtSign,
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  Globe,
  GlobeLock,
  Handshake,
  Link2,
  MapPin,
  MessageCircle,
  Phone,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Botao, LinkBotao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { useNotificar } from "@/components/ui/notificacoes";
import { Selo } from "@/components/ui/selo";
import { ETAPAS, SITE, STATUS } from "@/data/status";
import { cn } from "@/lib/cn";
import { formatarData } from "@/lib/formato";
import { montarMensagem } from "@/lib/mensagem";
import { formatarTelefone, linkWhatsApp } from "@/lib/telefone";
import { atualizarContatoAcao, excluirContatoAcao } from "@/server/acoes";
import type { ConfigMensagem, Contato, ContatoStatus } from "@/types";

const ICONE_SITE = { sem_site: GlobeLock, so_perfil: AtSign, com_site: Globe } as const;
const ICONE_ETAPA = { enviado: Send, respondeu: Reply, fechado: Handshake } as const;
// Cor da etapa marcada (fundo suave + texto forte): o estado também é dito pelo ícone e por aria-pressed.
const COR_ETAPA = {
  enviado: "aria-pressed:bg-info-soft aria-pressed:text-info aria-pressed:border-info/40",
  respondeu: "aria-pressed:bg-highlight-soft aria-pressed:text-highlight aria-pressed:border-highlight/40",
  fechado: "aria-pressed:bg-success-soft aria-pressed:text-success aria-pressed:border-success/40",
} as const;

interface Props {
  contato: Contato;
  config: ConfigMensagem;
  /** Na lista de contatos mostra a observação; nos resultados da busca, não. */
  comObservacao?: boolean;
  aoAtualizar?: (contato: Contato) => void;
  aoExcluir?: (id: string) => void;
}

export function CartaoContato({ contato: inicial, config, comObservacao, aoAtualizar, aoExcluir }: Props) {
  const [contato, setContato] = useState(inicial);
  const [texto, setTexto] = useState(() => montarMensagem(config.modelo, inicial, config));
  const [perguntarEnvio, setPerguntarEnvio] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluido, setExcluido] = useState(false);
  const [observacao, setObservacao] = useState(inicial.observacao ?? "");
  // Quando o contato muda fora deste cartão (ex.: em outro aparelho), mostra a versão nova.
  const [versao, setVersao] = useState(inicial.atualizadoEm);
  if (inicial.atualizadoEm !== versao) {
    setVersao(inicial.atualizadoEm);
    setContato(inicial);
    setObservacao(inicial.observacao ?? "");
  }
  const [salvando, iniciar] = useTransition();
  const [excluindo, iniciarExclusao] = useTransition();
  const notificar = useNotificar();
  const id = useId();
  const perguntaRef = useRef<HTMLDivElement>(null);

  const primeiroContato = contato.status === "novo";
  const IconeSite = ICONE_SITE[contato.siteStatus];
  const site = SITE[contato.siteStatus];

  // Ao voltar do WhatsApp, traz a pergunta "Você enviou?" para a tela.
  useEffect(() => {
    if (!perguntarEnvio) return;
    function aoVoltar() {
      if (document.visibilityState !== "visible") return;
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      perguntaRef.current?.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
    }
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [perguntarEnvio]);

  function atualizar(mudancas: { status?: ContatoStatus; observacao?: string | null }, sucesso: string) {
    const anterior = contato;
    setContato({ ...contato, ...mudancas });
    iniciar(async () => {
      const r = await atualizarContatoAcao(contato.id, mudancas);
      if (r.ok) {
        setContato(r.data);
        aoAtualizar?.(r.data);
        notificar(sucesso);
      } else {
        setContato(anterior);
        notificar(r.error, "erro");
      }
    });
  }

  function marcarEtapa(etapa: (typeof ETAPAS)[number]) {
    const desmarcar = contato.status === etapa;
    if (etapa === "enviado" || desmarcar) setPerguntarEnvio(false);
    atualizar({ status: desmarcar ? "novo" : etapa }, desmarcar ? "Andamento desmarcado." : `Marcado: ${STATUS[etapa].rotulo}.`);
  }

  function excluir() {
    iniciarExclusao(async () => {
      const r = await excluirContatoAcao(contato.id);
      if (r.ok) {
        setConfirmarExclusao(false);
        setExcluido(true);
        notificar(`${contato.nome} foi excluída.`);
        aoExcluir?.(contato.id);
      } else {
        notificar(r.error, "erro");
      }
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      notificar("Mensagem copiada.");
    } catch {
      notificar("Não foi possível copiar. Selecione o texto e copie manualmente.", "erro");
    }
  }

  if (excluido) return null;

  const busca = `https://www.google.com/search?q=${encodeURIComponent(`${contato.nome} ${contato.cidade}`)}`;

  return (
    <article aria-labelledby={`${id}-nome`} className="animate-entrar rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      {/* Cabeçalho: nome, situação do site e exclusão */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-nome`} className="text-15 font-semibold break-words">
            {contato.nome}
          </h3>
          <p className="mt-0.5 text-13 text-fg-3">
            {[contato.categoria, contato.endereco ?? `${contato.cidade} - ${contato.uf}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Selo tom={site.tom} icone={<IconeSite aria-hidden />} className="mt-0.5">
          {contato.siteStatus === "so_perfil" ? `Só ${contato.siteRotulo ?? "perfil"}` : site.rotulo}
        </Selo>
        <button
          type="button"
          onClick={() => setConfirmarExclusao(true)}
          aria-label={`Excluir ${contato.nome}`}
          title="Excluir empresa"
          className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger-soft focus-visible:bg-danger-soft"
        >
          <Trash2 className="size-[18px]" aria-hidden />
        </button>
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-13 text-fg-2">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Telefone</dt>
          <Phone className="size-3.5 text-fg-3" aria-hidden />
          <dd>{contato.telefone ? formatarTelefone(contato.telefone) : <span className="text-fg-3">Sem telefone</span>}</dd>
          {contato.telefoneTipo === "fixo" ? <dd className="text-12 text-warning">(fixo — pode não ter WhatsApp)</dd> : null}
        </div>
        {contato.avaliacao ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Avaliação no Google</dt>
            <Star className="size-3.5 fill-current text-warning" aria-hidden />
            <dd>
              {contato.avaliacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              <span className="text-fg-3"> ({(contato.avaliacoes ?? 0).toLocaleString("pt-BR")} avaliações)</span>
            </dd>
          </div>
        ) : null}
        {contato.consultadoEm ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Data da consulta dos dados</dt>
            <CalendarCheck className="size-3.5 text-fg-3" aria-hidden />
            <dd className="text-fg-3">Consultado em {formatarData(contato.consultadoEm)}</dd>
          </div>
        ) : null}
      </dl>

      {/* Andamento: três etapas; tocar na etapa marcada desmarca */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p id={`${id}-andamento`} className="text-12 font-medium text-fg-3">
            Andamento
          </p>
          {contato.contatadoEm ? <p className="text-12 text-fg-3">Contatada em {formatarData(contato.contatadoEm)}</p> : null}
        </div>
        <div role="group" aria-labelledby={`${id}-andamento`} className="grid grid-cols-3 gap-1.5">
          {ETAPAS.map((etapa) => {
            const Icone = ICONE_ETAPA[etapa];
            const marcada = contato.status === etapa;
            return (
              <button
                key={etapa}
                type="button"
                aria-pressed={marcada}
                disabled={salvando}
                onClick={() => marcarEtapa(etapa)}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-13 font-medium text-fg-2 transition-colors",
                  "hover:border-border-strong hover:text-fg disabled:opacity-60",
                  COR_ETAPA[etapa],
                )}
              >
                {marcada ? <Check className="size-4 shrink-0" aria-hidden /> : <Icone className="size-4 shrink-0" aria-hidden />}
                <span className="truncate">{STATUS[etapa].rotulo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-13 font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
          <MessageCircle className="size-3.5" aria-hidden />
          <span className="group-open:hidden">Ver e editar a mensagem</span>
          <span className="hidden group-open:inline">Esconder a mensagem</span>
        </summary>
        <label htmlFor={`${id}-mensagem`} className="sr-only">
          Mensagem para {contato.nome}
        </label>
        <AreaTexto id={`${id}-mensagem`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} className="mt-2" />
      </details>

      {/* Pergunta depois de abrir o WhatsApp: em destaque, para não chamar a mesma empresa duas vezes */}
      {perguntarEnvio && primeiroContato ? (
        <div ref={perguntaRef} role="status" className="mt-4 animate-entrar rounded-xl border-2 border-accent bg-accent-soft p-4">
          <p className="flex items-center gap-2 text-15 font-semibold text-accent-soft-fg">
            <Send className="size-4 shrink-0" aria-hidden />
            Você enviou a mensagem?
          </p>
          <p className="mt-1 text-13 text-fg-2">Marque como enviada para não chamar {contato.nome} duas vezes.</p>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:flex">
            <Botao variante="primario" tamanho="lg" carregando={salvando} icone={<Check aria-hidden />} onClick={() => marcarEtapa("enviado")}>
              Sim, enviei
            </Botao>
            <Botao variante="secundario" tamanho="lg" onClick={() => setPerguntarEnvio(false)}>
              Ainda não
            </Botao>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkBotao
          variante="whatsapp"
          href={contato.telefone ? linkWhatsApp(contato.telefone, primeiroContato ? texto : undefined) : undefined}
          desativado={!contato.telefone}
          title={contato.telefone ? undefined : "Esta empresa não tem telefone cadastrado na fonte"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => primeiroContato && setPerguntarEnvio(true)}
          icone={<MessageCircle aria-hidden />}
          className="grow sm:grow-0"
        >
          {primeiroContato ? "Enviar no WhatsApp" : "Abrir conversa"}
        </LinkBotao>
        <Botao variante="secundario" onClick={copiar} icone={<Copy aria-hidden />}>
          Copiar
        </Botao>
        {contato.telefone ? (
          <LinkBotao variante="fantasma" href={`tel:+${contato.telefone}`} icone={<Phone aria-hidden />} aria-label={`Ligar para ${contato.nome}`}>
            Ligar
          </LinkBotao>
        ) : null}
        {contato.mapsUrl ? (
          <LinkBotao variante="fantasma" href={contato.mapsUrl} target="_blank" rel="noopener noreferrer" icone={<MapPin aria-hidden />}>
            Mapa
          </LinkBotao>
        ) : null}
        {contato.fonte === "importado" && contato.origemUrl ? (
          <LinkBotao variante="fantasma" href={contato.origemUrl} target="_blank" rel="noopener noreferrer" icone={<Link2 aria-hidden />} title="Página onde a empresa foi encontrada">
            Fonte
          </LinkBotao>
        ) : null}
        {contato.siteUrl ? (
          <LinkBotao variante="fantasma" href={contato.siteUrl} target="_blank" rel="noopener noreferrer" icone={<ExternalLink aria-hidden />}>
            {contato.siteStatus === "so_perfil" ? (contato.siteRotulo ?? "Perfil") : "Site"}
          </LinkBotao>
        ) : (
          <LinkBotao variante="fantasma" href={busca} target="_blank" rel="noopener noreferrer" icone={<Search aria-hidden />} title="Confira no Google se a empresa tem site">
            Conferir site
          </LinkBotao>
        )}
      </div>

      {comObservacao ? (
        <div className="mt-4 border-t border-border pt-3">
          <label htmlFor={`${id}-obs`} className="text-12 font-medium text-fg-3">
            Observação
          </label>
          <AreaTexto
            id={`${id}-obs`}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            onBlur={() => {
              if ((contato.observacao ?? "") !== observacao.trim()) atualizar({ observacao }, "Observação salva.");
            }}
            rows={2}
            placeholder="Ex.: pediu para chamar depois do dia 10"
            className="mt-1"
          />
        </div>
      ) : null}

      <DialogoConfirmacao
        aberto={confirmarExclusao}
        titulo={`Excluir ${contato.nome}?`}
        confirmar="Excluir"
        icone={<Trash2 aria-hidden />}
        carregando={excluindo}
        aoConfirmar={excluir}
        aoFechar={() => setConfirmarExclusao(false)}
      >
        A empresa sai dos seus contatos e não aparece mais em buscas nem importações. Use também para quem pediu para não receber mensagens.
      </DialogoConfirmacao>
    </article>
  );
}
