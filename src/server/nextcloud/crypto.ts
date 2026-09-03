import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "~/env";

/**
 * Unlike the user's passwordHash, the Nextcloud app password must be readable again
 * (the app needs to send it to the WebDAV endpoint). So we encrypt it (not hash it)
 * with an AES-256-GCM key derived from AUTH_SECRET (already a required strong secret
 * anyway, no new env variable needed).
 */
function deriveKey(): Buffer {
  if (!env.AUTH_SECRET) {
    // In dev without AUTH_SECRET (env.js doesn't require it there) the encryption key
    // would always be the same predictable string — better to raise an error than
    // silently use a weak cipher.
    throw new Error("AUTH_SECRET musí být nastaven pro šifrování Nextcloud hesla.");
  }
  return createHash("sha256").update(`nextcloud-app-password:${env.AUTH_SECRET}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Neplatný formát šifrovaného hesla.");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
