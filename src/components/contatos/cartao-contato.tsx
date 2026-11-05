"use client";

import { AtSign, Check, Copy, ExternalLink, Globe, GlobeLock, Link2, MapPin, MessageCircle, Phone, Search, Star } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Botao, LinkBotao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { useNotificar } from "@/components/ui/notificacoes";
import { Selo } from "@/components/ui/selo";
import { ORDEM_STATUS, SITE, STATUS } from "@/data/status";
import { cn } from "@/lib/cn";
import { formatarData } from "@/lib/formato";
import { montarMensagem } from "@/lib/mensagem";
import { formatarTelefone, linkWhatsApp } from "@/lib/telefone";
import { atualizarContatoAcao } from "@/server/acoes";
import type { ConfigMensagem, Contato, ContatoStatus } from "@/types";

const ICONE_SITE = { sem_site: GlobeLock, so_perfil: AtSign, com_site: Globe } as const;

interface Props {
  contato: Contato;
  config: ConfigMensagem;
  /** Na lista de contatos mostra a observação; nos resultados da busca, não. */
  comObservacao?: boolean;
  aoAtualizar?: (contato: Contato) => void;
}

export function CartaoContato({ contato: inicial, config, comObservacao, aoAtualizar }: Props) {
  const [contato, setContato] = useState(inicial);
  const [texto, setTexto] = useState(() => montarMensagem(config.modelo, inicial, config));
  const [perguntarEnvio, setPerguntarEnvio] = useState(false);
  const [observacao, setObservacao] = useState(inicial.observacao ?? "");
  // Quando o contato muda fora deste cartão (ex.: em outro aparelho), mostra a versão nova.
  const [versao, setVersao] = useState(inicial.atualizadoEm);
  if (inicial.atualizadoEm !== versao) {
    setVersao(inicial.atualizadoEm);
    setContato(inicial);
    setObservacao(inicial.observacao ?? "");
  }
  const [salvando, iniciar] = useTransition();
  const notificar = useNotificar();
  const id = useId();

  const bloqueado = contato.status === "nao_contatar";
  const primeiroContato = contato.status === "novo";
  const IconeSite = ICONE_SITE[contato.siteStatus];
  const site = SITE[contato.siteStatus];

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

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      notificar("Mensagem copiada.");
    } catch {
      notificar("Não foi possível copiar. Selecione o texto e copie manualmente.", "erro");
    }
  }

  const busca = `https://www.google.com/search?q=${encodeURIComponent(`${contato.nome} ${contato.cidade}`)}`;

  return (
    <article
      aria-labelledby={`${id}-nome`}
      className={cn("animate-entrar rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5", bloqueado && "opacity-75")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-nome`} className="text-15 font-semibold break-words">
            {contato.nome}
          </h3>
          <p className="mt-0.5 text-13 text-fg-3">
            {[contato.categoria, contato.endereco ?? `${contato.cidade} - ${contato.uf}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Selo tom={site.tom} icone={<IconeSite aria-hidden />}>
          {contato.siteStatus === "so_perfil" ? `Só ${contato.siteRotulo ?? "perfil"}` : site.rotulo}
        </Selo>
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
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-status`} className="sr-only">
          Andamento do contato
        </label>
        <select
          id={`${id}-status`}
          value={contato.status}
          disabled={salvando}
          onChange={(e) => atualizar({ status: e.target.value as ContatoStatus }, `Andamento: ${STATUS[e.target.value as ContatoStatus].rotulo}.`)}
          className="h-8 rounded-full border border-border-strong bg-surface-2 px-3 text-13 font-medium text-fg hover:border-fg-3 focus:border-accent focus:outline-none"
        >
          {ORDEM_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].rotulo}
            </option>
          ))}
        </select>
        {contato.contatadoEm ? <span className="text-12 text-fg-3">Contatado em {formatarData(contato.contatadoEm)}</span> : null}
      </div>

      {bloqueado ? (
        <p className="mt-3 text-13 text-danger">Pediu para não receber mensagens. O envio fica bloqueado.</p>
      ) : (
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
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!bloqueado ? (
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
        ) : null}
        {!bloqueado ? (
          <Botao variante="secundario" onClick={copiar} icone={<Copy aria-hidden />}>
            Copiar
          </Botao>
        ) : null}
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

      {perguntarEnvio && contato.status === "novo" ? (
        <div className="mt-3 flex animate-entrar flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-14">
          <p className="mr-auto">Você enviou a mensagem?</p>
          <Botao
            variante="primario"
            tamanho="sm"
            carregando={salvando}
            icone={<Check aria-hidden />}
            onClick={() => {
              setPerguntarEnvio(false);
              atualizar({ status: "enviado" }, "Marcado como enviado.");
            }}
          >
            Sim, marcar como enviada
          </Botao>
          <Botao variante="fantasma" tamanho="sm" onClick={() => setPerguntarEnvio(false)}>
            Ainda não
          </Botao>
        </div>
      ) : null}

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
    </article>
  );
}
