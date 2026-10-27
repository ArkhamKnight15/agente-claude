import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrações precisam de conexão direta; a aplicação pode usar a URL com pooler.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL"),
  },
});
