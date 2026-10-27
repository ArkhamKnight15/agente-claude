/**
 * Catálogo de nichos. Cada nicho define termos de busca (Google Places / busca web),
 * tags do OpenStreetMap e argumentos comerciais usados pelo agente quando a IA
 * não está configurada. `fit` (0–10) indica a compatibilidade típica com um site
 * de entrada (one-page) — é um ponto de partida editável, não uma verdade absoluta.
 */

export interface Niche {
  key: string;
  label: string;
  plural: string;
  searchTerms: string[];
  osmTags: Array<[key: string, value: string]>;
  fit: number;
  need: string;
  benefits: string[];
  suggestedSections: string[];
}

export const NICHES: Niche[] = [
  {
    key: "estetica-automotiva",
    label: "Estética automotiva",
    plural: "estéticas automotivas",
    searchTerms: ["estética automotiva", "lava rápido", "polimento automotivo"],
    osmTags: [
      ["shop", "car_repair"],
      ["amenity", "car_wash"],
    ],
    fit: 9,
    need: "mostrar serviços, antes e depois e facilitar o agendamento",
    benefits: [
      "Galeria de antes e depois para gerar confiança",
      "Lista de serviços com botão direto para o WhatsApp",
      "Ser encontrado por quem pesquisa no Google na região",
    ],
    suggestedSections: ["Serviços", "Antes e depois", "Pacotes", "Avaliações", "Localização", "Contato"],
  },
  {
    key: "oficina-mecanica",
    label: "Oficina mecânica",
    plural: "oficinas mecânicas",
    searchTerms: ["oficina mecânica", "mecânica automotiva", "auto center"],
    osmTags: [
      ["shop", "car_repair"],
      ["craft", "car_repair"],
    ],
    fit: 9,
    need: "transmitir confiança e explicar os serviços com clareza",
    benefits: [
      "Apresentar especialidades e marcas atendidas",
      "Pedido de orçamento direto pelo WhatsApp",
      "Mais credibilidade para quem compara oficinas",
    ],
    suggestedSections: ["Serviços", "Especialidades", "Diferenciais", "Avaliações", "Localização", "Contato"],
  },
  {
    key: "funilaria",
    label: "Funilaria e pintura",
    plural: "funilarias",
    searchTerms: ["funilaria e pintura", "funilaria", "martelinho de ouro"],
    osmTags: [["shop", "car_repair"]],
    fit: 8,
    need: "mostrar a qualidade do acabamento e facilitar orçamentos",
    benefits: [
      "Portfólio de trabalhos realizados",
      "Orçamento com envio de fotos pelo WhatsApp",
      "Informar se atende seguradoras",
    ],
    suggestedSections: ["Serviços", "Portfólio", "Seguradoras", "Localização", "Contato"],
  },
  {
    key: "imobiliaria",
    label: "Imobiliária",
    plural: "imobiliárias",
    searchTerms: ["imobiliária", "corretor de imóveis"],
    osmTags: [["office", "estate_agent"]],
    fit: 6,
    need: "apresentar a imobiliária e captar contatos de interessados",
    benefits: [
      "Página institucional com equipe e CRECI",
      "Destaque para imóveis e canais de atendimento",
      "Captação de proprietários interessados em anunciar",
    ],
    suggestedSections: ["Sobre", "Imóveis em destaque", "Anuncie seu imóvel", "Equipe", "Contato"],
  },
  {
    key: "clinica-odontologica",
    label: "Clínica odontológica",
    plural: "clínicas odontológicas",
    searchTerms: ["clínica odontológica", "dentista", "consultório odontológico"],
    osmTags: [
      ["amenity", "dentist"],
      ["healthcare", "dentist"],
    ],
    fit: 9,
    need: "passar segurança ao paciente e facilitar o agendamento",
    benefits: [
      "Apresentar tratamentos e o corpo clínico",
      "Agendamento rápido pelo WhatsApp",
      "Informar convênios e localização",
    ],
    suggestedSections: ["Tratamentos", "Equipe", "Convênios", "Estrutura", "Localização", "Agendamento"],
  },
  {
    key: "clinica-estetica",
    label: "Clínica de estética",
    plural: "clínicas de estética",
    searchTerms: ["clínica de estética", "estética facial", "estética corporal"],
    osmTags: [["shop", "beauty"]],
    fit: 9,
    need: "apresentar procedimentos e converter interessados em agendamentos",
    benefits: [
      "Página de procedimentos com explicações claras",
      "Agendamento direto pelo WhatsApp",
      "Mais confiança com fotos do espaço e da equipe",
    ],
    suggestedSections: ["Procedimentos", "Resultados", "Equipe", "Espaço", "Agendamento"],
  },
  {
    key: "barbearia",
    label: "Barbearia",
    plural: "barbearias",
    searchTerms: ["barbearia", "barber shop"],
    osmTags: [
      ["shop", "hairdresser"],
      ["hairdresser", "barber"],
    ],
    fit: 8,
    need: "mostrar estilo, preços e facilitar o agendamento",
    benefits: [
      "Tabela de serviços e preços sempre acessível",
      "Botão de agendamento pelo WhatsApp",
      "Galeria de cortes para atrair novos clientes",
    ],
    suggestedSections: ["Serviços e preços", "Galeria", "Equipe", "Localização", "Agendamento"],
  },
  {
    key: "salao-de-beleza",
    label: "Salão de beleza",
    plural: "salões de beleza",
    searchTerms: ["salão de beleza", "cabeleireiro", "manicure"],
    osmTags: [
      ["shop", "hairdresser"],
      ["shop", "beauty"],
    ],
    fit: 8,
    need: "divulgar serviços e transformar visitas em agendamentos",
    benefits: [
      "Serviços organizados por categoria",
      "Agendamento pelo WhatsApp",
      "Portfólio de trabalhos e avaliações",
    ],
    suggestedSections: ["Serviços", "Portfólio", "Equipe", "Localização", "Agendamento"],
  },
  {
    key: "restaurante",
    label: "Restaurante",
    plural: "restaurantes",
    searchTerms: ["restaurante", "lanchonete", "pizzaria"],
    osmTags: [
      ["amenity", "restaurant"],
      ["amenity", "fast_food"],
    ],
    fit: 7,
    need: "mostrar cardápio, horários e canais de pedido",
    benefits: [
      "Cardápio online fácil de compartilhar",
      "Pedidos e reservas pelo WhatsApp sem taxa de aplicativo",
      "Horários e localização sempre atualizados",
    ],
    suggestedSections: ["Cardápio", "Sobre", "Fotos", "Horários", "Localização", "Pedidos"],
  },
  {
    key: "loja-local",
    label: "Loja local",
    plural: "lojas locais",
    searchTerms: ["loja", "comércio local"],
    osmTags: [["shop", "clothes"]],
    fit: 6,
    need: "apresentar produtos e levar clientes até a loja ou ao WhatsApp",
    benefits: [
      "Vitrine dos principais produtos",
      "Atendimento e pedidos pelo WhatsApp",
      "Ser encontrado por quem busca na região",
    ],
    suggestedSections: ["Produtos", "Sobre a loja", "Formas de pagamento", "Localização", "Contato"],
  },
  {
    key: "academia",
    label: "Academia",
    plural: "academias",
    searchTerms: ["academia", "crossfit", "estúdio de pilates"],
    osmTags: [
      ["leisure", "fitness_centre"],
      ["leisure", "sports_centre"],
    ],
    fit: 7,
    need: "apresentar modalidades, planos e captar alunos",
    benefits: [
      "Modalidades, horários e planos em um só lugar",
      "Agendamento de aula experimental pelo WhatsApp",
      "Fotos da estrutura para atrair novos alunos",
    ],
    suggestedSections: ["Modalidades", "Planos", "Estrutura", "Horários", "Aula experimental"],
  },
  {
    key: "empresa-de-limpeza",
    label: "Empresa de limpeza",
    plural: "empresas de limpeza",
    searchTerms: ["empresa de limpeza", "limpeza pós obra", "diarista"],
    osmTags: [["craft", "cleaning"]],
    fit: 8,
    need: "transmitir confiança e facilitar pedidos de orçamento",
    benefits: [
      "Serviços e áreas atendidas explicados com clareza",
      "Orçamento rápido pelo WhatsApp",
      "Credibilidade para fechar contratos com empresas",
    ],
    suggestedSections: ["Serviços", "Áreas atendidas", "Como funciona", "Orçamento", "Contato"],
  },
  {
    key: "prestador-de-servicos",
    label: "Prestador de serviços",
    plural: "prestadores de serviços",
    searchTerms: ["eletricista", "encanador", "chaveiro"],
    osmTags: [
      ["craft", "electrician"],
      ["craft", "plumber"],
      ["shop", "locksmith"],
    ],
    fit: 8,
    need: "ser encontrado na região e receber pedidos de orçamento",
    benefits: [
      "Serviços e região de atendimento claros",
      "Botão de chamada e WhatsApp em destaque",
      "Mais confiança de quem não conhece o profissional",
    ],
    suggestedSections: ["Serviços", "Região atendida", "Diferenciais", "Orçamento", "Contato"],
  },
  {
    key: "construcao",
    label: "Construção civil",
    plural: "empresas de construção",
    searchTerms: ["construtora", "empreiteira", "reformas"],
    osmTags: [
      ["office", "construction_company"],
      ["craft", "builder"],
    ],
    fit: 7,
    need: "mostrar obras realizadas e gerar pedidos de orçamento",
    benefits: [
      "Portfólio de obras e reformas",
      "Pedido de orçamento estruturado",
      "Credibilidade para projetos de maior valor",
    ],
    suggestedSections: ["Serviços", "Obras realizadas", "Processo", "Orçamento", "Contato"],
  },
  {
    key: "manutencao",
    label: "Manutenção",
    plural: "empresas de manutenção",
    searchTerms: ["manutenção predial", "assistência técnica", "ar condicionado instalação"],
    osmTags: [
      ["craft", "hvac"],
      ["shop", "electronics_repair"],
    ],
    fit: 8,
    need: "explicar os serviços e agilizar o atendimento de chamados",
    benefits: [
      "Serviços e marcas atendidas organizados",
      "Abertura de chamado pelo WhatsApp",
      "Atendimento a empresas e condomínios em destaque",
    ],
    suggestedSections: ["Serviços", "Atendimento empresarial", "Marcas", "Chamados", "Contato"],
  },
];

export const CUSTOM_NICHE_KEY = "personalizado";

export function getNiche(key: string | null | undefined): Niche | undefined {
  return NICHES.find((n) => n.key === key);
}

/** Nicho genérico para termos livres digitados pelo usuário. */
export function customNiche(term: string): Niche {
  return {
    key: CUSTOM_NICHE_KEY,
    label: term,
    plural: term,
    searchTerms: [term],
    osmTags: [],
    fit: 6,
    need: "apresentar o negócio de forma profissional e facilitar o contato",
    benefits: [
      "Presença profissional no Google",
      "Contato direto pelo WhatsApp",
      "Informações do negócio organizadas em um só lugar",
    ],
    suggestedSections: ["Sobre", "Serviços", "Diferenciais", "Localização", "Contato"],
  };
}
