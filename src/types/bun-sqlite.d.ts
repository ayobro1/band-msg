// Fallback type declarations for bun:sqlite.
// When @types/bun is installed, those types take precedence.
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }

  interface Statement {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
}
