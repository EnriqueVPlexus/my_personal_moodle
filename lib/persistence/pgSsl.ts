/**
 * Decides the `ssl` option for node-postgres, shared by the app pool
 * (`PostgresDb`) and the formal migration runner (`scripts/migrate.ts`).
 *
 * - `DATABASE_SSL` = `false` | `disable` | `0` | `off` | `no` -> SSL disabled
 *   (needed for a Postgres reached through a non-local hostname that does not
 *   speak SSL, e.g. the `db` service of docker-compose.yml).
 * - `DATABASE_SSL` = `true` | `require` | `1` | `on` | `yes` -> SSL forced.
 * - Unset/other -> legacy behaviour: SSL off only for localhost/127.0.0.1,
 *   required (without CA verification, as Supabase needs) otherwise.
 */
export type PgSslOption = false | { rejectUnauthorized: false }

const DISABLED_VALUES = new Set(['false', 'disable', '0', 'off', 'no'])
const ENABLED_VALUES = new Set(['true', 'require', '1', 'on', 'yes'])

export function resolvePgSsl(
  connectionString: string,
  databaseSsl: string | undefined = process.env.DATABASE_SSL
): PgSslOption {
  const flag = (databaseSsl ?? '').trim().toLowerCase()
  if (DISABLED_VALUES.has(flag)) return false
  if (ENABLED_VALUES.has(flag)) return { rejectUnauthorized: false }

  const isLocalHost = /^postgres(?:ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
  return isLocalHost ? false : { rejectUnauthorized: false }
}
