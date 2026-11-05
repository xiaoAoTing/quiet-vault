const DB_NAME = 'quiet-vault.session';
const STORE_NAME = 'keys';
const RECORD_ID = 'vault';
type StoredKey = { id: typeof RECORD_ID; key: CryptoKey; salt: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = task(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

// CryptoKey is stored as a structured clone and stays non-extractable, so scripts cannot read the raw bytes.
export async function saveSessionKey(key: CryptoKey, salt: string): Promise<void> {
  await withStore('readwrite', store => store.put({ id: RECORD_ID, key, salt }));
}

export async function loadSessionKey(): Promise<{ key: CryptoKey; salt: string } | null> {
  const record = await withStore<StoredKey | undefined>('readonly', store => store.get(RECORD_ID));
  if (!record || !(record.key instanceof CryptoKey) || typeof record.salt !== 'string') return null;
  return { key: record.key, salt: record.salt };
}

export async function clearSessionKey(): Promise<void> {
  await withStore('readwrite', store => store.delete(RECORD_ID));
}
