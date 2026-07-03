// Minimal ambient types for the Node builtins used only by the test suite.
// (Avoids pulling in @types/node, which would clash with
// @cloudflare/workers-types globals in the main tsconfig.)

interface ImportMeta {
  url: string;
}

declare module "node:sqlite" {
  export interface StatementSync {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module "node:fs" {
  export function readFileSync(
    path: string | URL,
    encoding: "utf-8"
  ): string;
}
