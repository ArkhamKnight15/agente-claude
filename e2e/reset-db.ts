import { db } from "@/server/db";
import { resetDatabase } from "../tests/helpers/db";

resetDatabase()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
