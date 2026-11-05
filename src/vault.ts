import { argon2id } from 'hash-wasm';
export type Category = { id: string; name: string };
export type Entry = { id: string; username: string; password: string; notes: string; categoryId: string; updatedAt: string };
export type Vault = { categories: Category[]; entries: Entry[] };
const params = { algorithm: 'Argon2id', memorySize: 65536, iterations: 3, parallelism: 1 } as const;
export type Envelope = { format: 'quiet-vault'; version: 1; kdf: typeof params; salt: string; iv: string; ciphertext: string };
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MASTER_PASSWORD_MIN_LENGTH = 12;
export function masterPasswordProblem(password: string): string | null {
  if (password.length < MASTER_PASSWORD_MIN_LENGTH) return `主密码至少需要 ${MASTER_PASSWORD_MIN_LENGTH} 个字符`;
  if (!/[a-z]/.test(password)) return '主密码需要包含小写字母';
  if (!/[A-Z]/.test(password)) return '主密码需要包含大写字母';
  if (!/[0-9]/.test(password)) return '主密码需要包含数字';
  return null;
}
const encoder = new TextEncoder();
const aad = encoder.encode('quiet-vault:1');
export const emptyVault = (): Vault => ({ categories: [], entries: [] });
const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function parseEnvelope(text: string): Envelope {
  if (text.length > MAX_FILE_SIZE) throw new Error('文件不能超过 5 MB');
  const e = JSON.parse(text);
  if (e?.format !== 'quiet-vault' || e.version !== 1 || !e.kdf || Object.entries(params).some(([k,v]) => e.kdf[k] !== v)) throw new Error('不支持的保险库格式或加密参数');
  for (const key of ['salt', 'iv', 'ciphertext']) if (typeof e[key] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(e[key])) throw new Error('密文格式无效');
  if (bytes(e.salt).length !== 16 || bytes(e.iv).length !== 12 || bytes(e.ciphertext).length < 16) throw new Error('密文长度无效');
  return e;
}
export function validateVault(v: unknown): asserts v is Vault {
  const d = v as Vault;
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.entries)) throw new Error('保险库内容无效');
  const ids = new Set<string>();
  for (const c of d.categories) {
    if (!c || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim() || ids.has(c.id)) throw new Error('分类内容无效');
    ids.add(c.id);
  }
  const entryIds = new Set<string>();
  for (const e of d.entries) {
    if (!e || ['id','username','password','notes','categoryId','updatedAt'].some(k => typeof e[k as keyof Entry] !== 'string') || !e.id || entryIds.has(e.id) || (e.categoryId && !ids.has(e.categoryId))) throw new Error('条目内容无效');
    entryIds.add(e.id);
  }
}
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await argon2id({ password, salt, ...params, hashLength: 32, outputType: 'binary' });
  try { return await crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt','decrypt']); }
  finally { raw.fill(0); }
}
export async function seal(vault: Vault, key: CryptoKey, salt: string): Promise<Envelope> {
  validateVault(vault);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(vault));
  try {
    const ciphertext = b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, plain)));
    const envelope: Envelope = { format: 'quiet-vault', version: 1, kdf: params, salt, iv: b64(iv), ciphertext };
    if (JSON.stringify(envelope).length > MAX_FILE_SIZE) throw new Error('保险库已超过 5 MB 限制');
    return envelope;
  } finally { plain.fill(0); }
}
export async function createVault(password: string) {
  const problem = masterPasswordProblem(password);
  if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const vault = emptyVault();
  return { key, vault, envelope: await seal(vault, key, b64(salt)) };
}
export async function openVault(envelope: Envelope, password: string) {
  // Validate even when called outside the file-import flow. Fixed KDF limits prevent resource exhaustion.
  envelope = parseEnvelope(JSON.stringify(envelope));
  const key = await deriveKey(password, bytes(envelope.salt));
  let plain: Uint8Array;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: aad, tagLength: 128 }, key, bytes(envelope.ciphertext))); }
  catch { throw new Error('无法解锁：主密码错误或文件已损坏'); }
  try { const vault: unknown = JSON.parse(new TextDecoder().decode(plain)); validateVault(vault); return { key, vault, envelope }; }
  finally { plain.fill(0); }
}
