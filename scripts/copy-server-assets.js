import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist-server/store", { recursive: true });
copyFileSync("src/store/schema.sql", "dist-server/store/schema.sql");
