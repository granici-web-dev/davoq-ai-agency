import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Секреты коннекторов (токены CRM клиента) шифруются перед записью в базу.
 * Ключ — из окружения; в проде он должен приходить из KMS, а не из .env.
 *
 * AES-256-GCM даёт и шифрование, и проверку целостности: подменённый шифротекст
 * не расшифруется, а не расшифруется в подставной токен.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const raw = process.env.SECRETS_KEY;
  if (!raw) throw new Error('SECRETS_KEY is not set — connector secrets cannot be encrypted');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes, base64-encoded');
  return buf;
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(blob: Buffer): string {
  // Длина проверяется до разбора: `subarray` за концом буфера не бросает, а молча
  // отдаёт кусок короче — обрезанная строка в базе доехала бы до `setAuthTag`
  // укороченной меткой вместо внятного отказа.
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error(`encrypted secret is truncated: ${blob.length} bytes`);
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  // authTagLength задан явно: GCM в Node принимает метки в 4, 8 и 12 байт наравне
  // с полными шестнадцатью, а короткая метка подбирается перебором на порядки
  // дешевле. Без этого параметра проверка целостности зависит от того, сколько
  // байт пришло, — то есть от того, что мы и проверяем.
  const decipher = createDecipheriv('aes-256-gcm', key(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

/** Генератор ключа для .env: `tsx -e "import('./src/llm/secrets.js').then(m=>console.log(m.newKey()))"` */
export const newKey = (): string => randomBytes(32).toString('base64');
