// Simulador da Google Places API (New) usado só nos testes: responde com empresas fictícias.
import { createServer } from "node:http";

const lugar = (n, extra = {}) => ({
  id: `teste-${n}`,
  displayName: { text: extra.nome ?? `Barbearia Teste ${n}` },
  formattedAddress: `Rua Exemplo, ${n * 10} - Centro, Campinas - SP`,
  addressComponents: [{ longText: extra.cidade ?? "Campinas", shortText: "Campinas", types: ["administrative_area_level_2", "political"] }],
  nationalPhoneNumber: extra.telefone ?? `(19) 98000-00${String(n).padStart(2, "0")}`,
  googleMapsUri: `https://maps.google.com/?cid=${n}`,
  businessStatus: extra.status ?? "OPERATIONAL",
  primaryTypeDisplayName: { text: "Barbearia" },
  rating: 4.5,
  userRatingCount: 30 + n,
  ...(extra.site ? { websiteUri: extra.site } : {}),
});

const PAGINA_1 = [
  lugar(1, { nome: "Barbearia do João" }),
  lugar(2, { nome: "Corte Fino", site: "https://www.instagram.com/cortefino" }),
  lugar(3, { nome: "Studio Barba", site: "https://studiobarba.com.br" }),
  lugar(4, { nome: "Barbearia Fechada", status: "CLOSED_PERMANENTLY" }),
];
const PAGINA_2 = [
  lugar(5, { nome: "Barbearia Vizinha", cidade: "Sumaré" }),
  lugar(6, { nome: "Navalha de Ouro", telefone: "(19) 3232-1010" }),
];

export function iniciarGoogleSimulado(porta) {
  const servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers["x-goog-api-key"] !== "chave-de-teste") {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED", details: [{ reason: "API_KEY_SERVICE_BLOCKED", metadata: { consumer: "projects/123" } }] } }));
      }
      const { pageToken } = JSON.parse(corpo || "{}");
      res.end(JSON.stringify(pageToken === "p2" ? { places: PAGINA_2 } : { places: PAGINA_1, nextPageToken: "p2" }));
    });
  });
  return new Promise((resolve) => servidor.listen(porta, "127.0.0.1", () => resolve(servidor)));
}

if (process.argv[2] === "--servir") {
  await iniciarGoogleSimulado(Number(process.argv[3] ?? 4455));
  console.log("Google simulado ouvindo");
}
