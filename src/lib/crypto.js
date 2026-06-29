// ── Crypto utilities ─────────────────────────────────────────────────────
//
// Encryption key = PBKDF2(time_key [+ recipient_signature])
//
// time_key:
//   - Random 32 bytes generated client-side at seal time
//   - Stored on-chain in the Move contract
//   - ONLY released by the contract's `get_time_key` view function once
//     `timestamp::now_seconds() >= unlock_time` — enforced by the Aptos
//     blockchain itself, not by client-side trust.
//
// recipient_signature (optional):
//   - Ed25519 signature is deterministic: same wallet + same message always
//     produces the same signature bytes.
//   - Only the holder of the recipient's private key can ever reproduce it.
//   - When present, it's mixed into the key derivation so that even after
//     time_key becomes public, only the intended recipient can decrypt.

export function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/** Generate a fresh random 32-byte time_key. */
export function generateTimeKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Derive an AES-256-GCM key from the time_key bytes + optional recipient secret. */
async function deriveAesKey(timeKeyBytes, recipientSecretB64) {
  let material = timeKeyBytes;
  if (recipientSecretB64) {
    const recipientBytes = base64ToBytes(recipientSecretB64);
    const combined = new Uint8Array(material.length + recipientBytes.length);
    combined.set(material, 0);
    combined.set(recipientBytes, material.length);
    material = combined;
  }

  const keyMaterial = await crypto.subtle.importKey('raw', material, { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('shelby-capsule-v3-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt plaintext with the time_key (+ optional recipient secret). Returns base64. */
export async function encryptMessage(plaintext, timeKeyBytes, recipientSecretB64) {
  const key = await deriveAesKey(timeKeyBytes, recipientSecretB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

/** Decrypt base64 ciphertext with the time_key (+ optional recipient secret). */
export async function decryptMessage(ciphertextB64, timeKeyBytes, recipientSecretB64) {
  const key = await deriveAesKey(timeKeyBytes, recipientSecretB64);
  const combined = base64ToBytes(ciphertextB64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

/**
 * Derive a deterministic secret from a wallet's signature over a fixed message.
 * Ed25519 signatures are deterministic — same key + same message = same output,
 * always. This is what binds the encryption key to a specific recipient wallet
 * without ever exposing their private key.
 */
export async function deriveRecipientSecret(wallet, capsuleSeed) {
  const signFeature = wallet.features?.['aptos:signMessage'];
  if (!signFeature) throw new Error('Wallet does not support message signing');

  const result = await signFeature.signMessage({
    message: 'shelby-capsule-recipient-key:' + capsuleSeed,
    nonce: '0',
  });

  const sig = result?.args?.signature || result?.signature;
  const sigBytes = typeof sig === 'string'
    ? hexToBytes(sig)
    : (sig?.data ? new Uint8Array(sig.data) : new Uint8Array(sig));

  const hash = await crypto.subtle.digest('SHA-256', sigBytes);
  return bytesToBase64(new Uint8Array(hash));
}
