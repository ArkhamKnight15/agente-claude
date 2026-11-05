// Ambiente dos testes. Os testes de integração usam um banco próprio (TEST_DATABASE_URL),
// que precisa terminar em "_test" para nunca apagar dados reais por engano.
const banco = process.env.TEST_DATABASE_URL;
if (banco) {
  if (!/_test(\?|$)/.test(banco)) throw new Error("TEST_DATABASE_URL precisa apontar para um banco cujo nome termina em _test.");
  process.env.DATABASE_URL = banco;
} else {
  process.env.DATABASE_URL = "postgresql://sem-banco/indisponivel_test";
}
process.env.APP_PASSWORD = "senha-de-teste-123";
process.env.GOOGLE_PLACES_API_KEY = "chave-de-teste";
process.env.GOOGLE_PLACES_URL = "https://places.teste/v1/places:searchText";
process.env.OVERPASS_URL = "https://osm-a.teste/api/interpreter,https://osm-b.teste/api/interpreter";
process.env.PLACES_DAILY_LIMIT = "30";
