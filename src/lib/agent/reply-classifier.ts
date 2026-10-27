import type { ReplyClassification } from "@/generated/prisma/enums";
import { normalizeText } from "@/lib/text";

/**
 * Classificação de respostas por regras. Pedidos de interrupção (opt-out) são sempre
 * detectados por regras determinísticas — a IA pode refinar outras categorias, mas
 * nunca anular um opt-out.
 */

export interface RuleClassification {
  classification: ReplyClassification;
  confidence: number;
  matched: string[];
}

const OPT_OUT = [
  "sair",
  "parar",
  "pare",
  "stop",
  "remover",
  "remova",
  "descadastrar",
  "descadastre",
  "cancelar inscricao",
  "nao quero receber",
  "nao me mande",
  "nao mande mais",
  "nao envie",
  "nao me envie",
  "nao entre em contato",
  "nao me procure",
  "nao me ligue",
  "para de mandar",
  "pare de mandar",
  "bloquear",
  "vou bloquear",
  "vou denunciar",
  "spam",
  "lgpd",
  "como conseguiu meu numero",
  "onde pegou meu numero",
];

const NOT_INTERESTED = [
  "nao tenho interesse",
  "sem interesse",
  "nao temos interesse",
  "nao preciso",
  "nao precisamos",
  "ja tenho site",
  "ja temos site",
  "ja possuo site",
  "agora nao",
  "nao no momento",
  "nao obrigado",
  "nao obrigada",
  "obrigado mas nao",
  "nao quero",
  "dispenso",
  "nao e o momento",
];

const INTERESTED = [
  "tenho interesse",
  "temos interesse",
  "me interessa",
  "interessante",
  "quero sim",
  "quero ver",
  "pode mandar",
  "pode me mostrar",
  "me mostra",
  "manda ai",
  "manda sim",
  "gostaria",
  "vamos conversar",
  "pode ligar",
  "pode me ligar",
  "bora",
  "fechado",
  "topo",
  "quero",
  "sim",
];

const QUESTION = [
  "quanto",
  "valor",
  "preco",
  "como funciona",
  "o que inclui",
  "inclui",
  "prazo",
  "parcel",
  "pix",
  "dominio",
  "hospedagem",
  "manutencao",
  "exemplo",
  "portfolio",
  "?",
];

function matches(text: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => {
    if (phrase === "?") return text.includes("?");
    const re = new RegExp(`(^|\\s)${phrase.replace(/\s+/g, "\\s+")}($|\\s)`);
    return re.test(text);
  });
}

export function classifyReplyByRules(raw: string): RuleClassification {
  const lowered = raw.toLowerCase();
  const text = normalizeText(raw);
  const withQuestion = lowered.includes("?") ? `${text} ?` : text;

  const optOut = matches(text, OPT_OUT);
  if (optOut.length) return { classification: "OPT_OUT", confidence: 0.95, matched: optOut };

  const negative = matches(text, NOT_INTERESTED);
  if (negative.length) return { classification: "NOT_INTERESTED", confidence: 0.85, matched: negative };

  const question = matches(withQuestion, QUESTION);
  const positive = matches(text, INTERESTED);
  if (question.length && positive.length) {
    return { classification: "INTERESTED", confidence: 0.8, matched: [...positive, ...question] };
  }
  if (question.length) return { classification: "QUESTION", confidence: 0.7, matched: question };
  if (positive.length) {
    // "sim"/"quero" isolados são fortes; misturados com outras palavras, moderados.
    const short = text.split(" ").length <= 4;
    return { classification: "INTERESTED", confidence: short ? 0.75 : 0.65, matched: positive };
  }
  return { classification: "NEUTRAL", confidence: 0.4, matched: [] };
}
