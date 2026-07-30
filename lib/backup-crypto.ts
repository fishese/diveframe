export const ENCRYPTED_BACKUP_FORMAT = "diveframe-encrypted-backup";
export const ENCRYPTED_BACKUP_VERSION = 1;

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type EncryptedBackupEnvelope = {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  encryption: {
    algorithm: "AES-GCM";
    kdf: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    saltBase64: string;
    ivBase64: string;
  };
  ciphertextBase64: string;
};

export class BackupPasswordRequiredError extends Error {
  constructor() {
    super("This backup is encrypted and requires its password.");
    this.name = "BackupPasswordRequiredError";
  }
}

export class BackupPasswordIncorrectError extends Error {
  constructor() {
    super("The password is incorrect or the encrypted backup is damaged.");
    this.name = "BackupPasswordIncorrectError";
  }
}

export function isEncryptedBackupEnvelope(
  value: unknown,
): value is EncryptedBackupEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedBackupEnvelope>;
  const encryption = candidate.encryption;
  return (
    candidate.format === ENCRYPTED_BACKUP_FORMAT &&
    candidate.version === ENCRYPTED_BACKUP_VERSION &&
    Boolean(encryption) &&
    encryption?.algorithm === "AES-GCM" &&
    encryption.kdf === "PBKDF2" &&
    encryption.hash === "SHA-256" &&
    Number.isInteger(encryption.iterations) &&
    encryption.iterations >= 100_000 &&
    typeof encryption.saltBase64 === "string" &&
    typeof encryption.ivBase64 === "string" &&
    typeof candidate.ciphertextBase64 === "string"
  );
}

export async function encryptBackupText(
  plaintext: string,
  password: string,
): Promise<EncryptedBackupEnvelope> {
  if (!password) throw new BackupPasswordRequiredError();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      saltBase64: bytesToBase64(salt),
      ivBase64: bytesToBase64(iv),
    },
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBackupEnvelope(
  envelope: EncryptedBackupEnvelope,
  password?: string,
): Promise<string> {
  if (!password) throw new BackupPasswordRequiredError();
  try {
    const salt = base64ToBytes(envelope.encryption.saltBase64);
    const iv = base64ToBytes(envelope.encryption.ivBase64);
    if (salt.byteLength < SALT_BYTES || iv.byteLength !== IV_BYTES) {
      throw new Error("Invalid encryption metadata.");
    }
    const key = await deriveKey(
      password,
      salt,
      envelope.encryption.iterations,
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(envelope.ciphertextBase64),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof BackupPasswordRequiredError) throw error;
    throw new BackupPasswordIncorrectError();
  }
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new BackupPasswordIncorrectError();
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
