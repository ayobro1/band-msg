import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd) {
    return cwd;
  }

  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function ensureServerEnv(): void {
  if (loaded) {
    return;
  }

  loaded = true;

  const root = getProjectRoot();
  loadDotenv({ path: resolve(root, ".env.local"), override: false });
  loadDotenv({ path: resolve(root, ".env"), override: false });
}
