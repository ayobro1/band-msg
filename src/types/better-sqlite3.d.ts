declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  class Database {
    constructor(path: string);
    pragma(command: string): unknown;
    exec(sql: string): this;
    prepare(sql: string): Statement;
  }

  export default Database;
}
