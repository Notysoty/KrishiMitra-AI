/**
 * Secrets loader — fetches application secrets from AWS Secrets Manager at startup.
 * Falls back to environment variables for local development.
 *
 * Call `loadSecrets()` once during server startup before any service uses secrets.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

// In-memory cache — set once at startup, read-only thereafter.
let jwtSecret = process.env.JWT_SECRET ?? 'krishimitra-dev-secret';

/**
 * Load secrets from AWS Secrets Manager.
 * Only runs when `AUTH_SECRET_NAME` env var is set.
 * Safe to call multiple times — skips if already loaded.
 */
export async function loadSecrets(): Promise<void> {
  const secretName = process.env.AUTH_SECRET_NAME;
  if (!secretName) {
    // Local dev: use env var or insecure default
    return;
  }

  const region = process.env.AWS_REGION ?? 'ap-south-1';
  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret '${secretName}' is empty`);
  }

  const parsed = JSON.parse(response.SecretString) as Record<string, string>;

  if (parsed.JWT_SECRET) {
    jwtSecret = parsed.JWT_SECRET;
  }
}

/** Returns the JWT signing secret. Always call `loadSecrets()` at startup first. */
export function getJwtSecret(): string {
  return jwtSecret;
}

/** Override the secret (used in tests). */
export function _setJwtSecret(secret: string): void {
  jwtSecret = secret;
}
