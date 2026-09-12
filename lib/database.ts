export type DatabaseRunResult = {
  changes?: number
  lastID?: number
}

export interface DatabaseClient {
  readonly backend: 'sqlite' | 'postgres'
  get<T = any>(sql: string, params?: unknown[]): Promise<T>
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<DatabaseRunResult>
  exec(sql: string): Promise<unknown>
  close(): Promise<unknown>
}
