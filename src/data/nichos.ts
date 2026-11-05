/**
 * Nichos com termos de busca (Google Places) e etiquetas do OpenStreetMap.
 * O primeiro termo é o principal; os demais completam a busca quando faltam resultados.
 */

export interface Nicho {
  chave: string;
  nome: string;
  termos: string[];
  osm: Array<[chave: string, valor: string]>;
}

export const NICHOS: Nicho[] = [
  { chave: "barbearia", nome: "Barbearia", termos: ["barbearia", "barber shop"], osm: [["shop", "hairdresser"], ["hairdresser", "barber"]] },
  { chave: "salao-de-beleza", nome: "Salão de beleza", termos: ["salão de beleza", "cabeleireiro", "manicure"], osm: [["shop", "hairdresser"], ["shop", "beauty"]] },
  { chave: "clinica-estetica", nome: "Clínica de estética", termos: ["clínica de estética", "estética facial"], osm: [["shop", "beauty"]] },
  { chave: "dentista", nome: "Dentista", termos: ["dentista", "clínica odontológica"], osm: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  { chave: "restaurante", nome: "Restaurante", termos: ["restaurante", "lanchonete", "pizzaria"], osm: [["amenity", "restaurant"], ["amenity", "fast_food"]] },
  { chave: "academia", nome: "Academia", termos: ["academia", "estúdio de pilates", "crossfit"], osm: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]] },
  { chave: "oficina-mecanica", nome: "Oficina mecânica", termos: ["oficina mecânica", "auto center"], osm: [["shop", "car_repair"], ["craft", "car_repair"]] },
  { chave: "estetica-automotiva", nome: "Estética automotiva", termos: ["estética automotiva", "lava rápido"], osm: [["amenity", "car_wash"]] },
  { chave: "funilaria", nome: "Funilaria e pintura", termos: ["funilaria e pintura", "martelinho de ouro"], osm: [["shop", "car_repair"]] },
  { chave: "imobiliaria", nome: "Imobiliária", termos: ["imobiliária", "corretor de imóveis"], osm: [["office", "estate_agent"]] },
  { chave: "pet-shop", nome: "Pet shop", termos: ["pet shop", "banho e tosa"], osm: [["shop", "pet"], ["shop", "pet_grooming"]] },
  { chave: "loja-de-roupas", nome: "Loja de roupas", termos: ["loja de roupas", "boutique"], osm: [["shop", "clothes"]] },
  { chave: "empresa-de-limpeza", nome: "Empresa de limpeza", termos: ["empresa de limpeza", "limpeza pós obra"], osm: [["craft", "cleaning"]] },
  { chave: "eletricista", nome: "Eletricista e encanador", termos: ["eletricista", "encanador"], osm: [["craft", "electrician"], ["craft", "plumber"]] },
  { chave: "construcao", nome: "Construção e reformas", termos: ["construtora", "reformas", "empreiteira"], osm: [["office", "construction_company"], ["craft", "builder"]] },
  { chave: "assistencia-tecnica", nome: "Assistência técnica", termos: ["assistência técnica", "conserto de celular"], osm: [["shop", "electronics_repair"], ["shop", "mobile_phone"]] },
];

export const NICHO_OUTRO = "outro";

export function nichoPorChave(chave: string): Nicho | undefined {
  return NICHOS.find((n) => n.chave === chave);
}
