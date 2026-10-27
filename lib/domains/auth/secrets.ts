/**
 * Refuses the placeholder secrets shipped in `.env.docker.example` when the
 * app runs in production. Pure: takes the env, throws with an operator-facing
 * message (server logs only; HTTP handlers surface a generic error).
 */
const PLACEHOLDER_PREFIX = 'change-me'
const CHECKED_VARIABLES = ['AUTH_PASSWORD_PEPPER', 'AUTH_SETUP_TOKEN'] as const

export function assertNoPlaceholderSecrets(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== 'production') return
  for (const name of CHECKED_VARIABLES) {
    const value = env[name]
    if (value && value.trim().toLowerCase().startsWith(PLACEHOLDER_PREFIX)) {
      throw new Error(
        `${name} still has the insecure placeholder value from .env.docker.example. ` +
          `Set a random value (for example: openssl rand -hex 32) in your env file and restart the app.`
      )
    }
  }
}
