/**
 * Server-only environment access for 46elks credentials.
 *
 * In production these values should be injected from a secret manager / runtime
 * environment (Vercel, Terraform, AWS Secrets Manager ...), never committed.
 * .env* files are git-ignored.
 */

export interface ElksCredentials {
  username: string
  password: string
}

export function hasElksCredentials(): boolean {
  return Boolean(process.env.ELKS_API_USERNAME && process.env.ELKS_API_PASSWORD)
}

/**
 * Read and validate the credentials. Throws a user-facing error when they are
 * missing, so a misconfigured deploy fails loudly instead of mysteriously.
 */
export function getElksCredentials(): ElksCredentials {
  const username = process.env.ELKS_API_USERNAME
  const password = process.env.ELKS_API_PASSWORD

  if (!username || !password) {
    // Never log values, only that they are absent.
    console.warn('[env] ELKS_API_USERNAME / ELKS_API_PASSWORD not set.')
    throw new Error(
      'Tjänsten är inte konfigurerad. Lägga in ELKS_API_USERNAME och ELKS_API_PASSWORD som miljövariabler i din deploy-miljö.',
    )
  }

  return { username, password }
}
