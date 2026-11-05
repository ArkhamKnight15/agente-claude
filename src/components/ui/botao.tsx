import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variante = "primario" | "secundario" | "fantasma" | "whatsapp" | "perigo";
type Tamanho = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  secundario: "border border-border-strong bg-surface text-fg hover:bg-surface-2 shadow-sm",
  fantasma: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  whatsapp: "bg-whatsapp text-white hover:bg-whatsapp-hover shadow-sm",
  perigo: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 gap-1.5 rounded-md px-2.5 text-13 [&_svg]:size-3.5",
  md: "h-10 gap-2 rounded-lg px-3.5 text-14 [&_svg]:size-4",
  lg: "h-12 gap-2 rounded-lg px-5 text-15 [&_svg]:size-[18px]",
};

export function classesBotao(variante: Variante = "secundario", tamanho: Tamanho = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none",
    "transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTES[variante],
    TAMANHOS[tamanho],
    extra,
  );
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
  icone?: ReactNode;
}

export function Botao({ variante, tamanho, carregando, icone, className, children, disabled, type = "button", ...props }: BotaoProps) {
  return (
    <button type={type} className={classesBotao(variante, tamanho, className)} disabled={disabled || carregando} aria-busy={carregando || undefined} {...props}>
      {carregando ? <LoaderCircle className="animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
}

interface LinkBotaoProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  icone?: ReactNode;
  desativado?: boolean;
}

/** Link com aparência de botão (ações que abrem outro app ou página). */
export function LinkBotao({ variante, tamanho, icone, desativado, className, children, href, ...props }: LinkBotaoProps) {
  return (
    <a
      className={classesBotao(variante, tamanho, className)}
      href={desativado ? undefined : href}
      // Sem href o <a> perde o papel de link; mantém o papel e anuncia que está desativado.
      role={desativado ? "link" : undefined}
      aria-disabled={desativado || undefined}
      {...props}
    >
      {icone}
      {children}
    </a>
  );
}
