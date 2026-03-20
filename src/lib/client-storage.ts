"use client";

const DB_NAME = "doifly-client-storage";
const DB_VERSION = 1;
const RECORD_STORE = "records";
const KEY_STORE = "keys";
const ENCRYPTION_KEY_ID = "aes-gcm-key-v1";
const ENCRYPTED_PREFIX = "enc:v1:";

const memoryRecords = new Map<string, string>();
const memoryStrings = new Map<string, string>();

let databasePromise: Promise<IDBDatabase | null> | null = null;

export type StoredJsonWriteMode = "encrypted" | "plain" | "memory";
export type StoredStringWriteMode = "plain" | "memory";

function hasWindow() {
  return typeof window !== "undefined";
}

function hasIndexedDb() {
  return hasWindow() && "indexedDB" in window;
}

function canUseCrypto() {
  return hasWindow() && window.isSecureContext && Boolean(window.crypto?.subtle);
}

function getLocalStorage(): Storage | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasWritableStringStorage() {
  const storage = getLocalStorage();

  if (!storage) {
    return false;
  }

  try {
    const probeKey = "__doifly_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return Promise.resolve(null);
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(RECORD_STORE)) {
          database.createObjectStore(RECORD_STORE);
        }

        if (!database.objectStoreNames.contains(KEY_STORE)) {
          database.createObjectStore(KEY_STORE);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return databasePromise;
}

function runIdbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

async function idbGet<T>(
  storeName: string,
  key: string,
): Promise<T | undefined> {
  const database = await openDatabase();

  if (!database) {
    return undefined;
  }

  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);

  return runIdbRequest(store.get(key));
}

async function idbPut(
  storeName: string,
  key: string,
  value: unknown,
): Promise<void> {
  const database = await openDatabase();

  if (!database) {
    throw new Error("IndexedDB is unavailable.");
  }

  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  await runIdbRequest(store.put(value, key));
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const database = await openDatabase();

  if (!database) {
    return;
  }

  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  await runIdbRequest(store.delete(key));
}

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (!canUseCrypto()) {
    return null;
  }

  try {
    const storedKey = await idbGet<JsonWebKey>(KEY_STORE, ENCRYPTION_KEY_ID);

    if (storedKey) {
      return await window.crypto.subtle.importKey(
        "jwk",
        storedKey,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
    }

    const generatedKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const exportedKey = await window.crypto.subtle.exportKey("jwk", generatedKey);
    await idbPut(KEY_STORE, ENCRYPTION_KEY_ID, exportedKey);

    return generatedKey;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function encryptPayload(value: string): Promise<string | null> {
  const key = await getEncryptionKey();

  if (!key) {
    return null;
  }

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const payload = new TextEncoder().encode(value);
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      payload,
    );

    return `${ENCRYPTED_PREFIX}${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
  } catch {
    return null;
  }
}

async function decryptPayload(value: string): Promise<string | null> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const key = await getEncryptionKey();

  if (!key) {
    return null;
  }

  const body = value.slice(ENCRYPTED_PREFIX.length);
  const separatorIndex = body.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  try {
    const iv = base64ToBytes(body.slice(0, separatorIndex));
    const payload = base64ToBytes(body.slice(separatorIndex + 1));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      payload,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export function readStoredString(key: string): string | null {
  const storage = getLocalStorage();

  if (storage) {
    try {
      const value = storage.getItem(key);

      if (value !== null) {
        return value;
      }
    } catch {
      return memoryStrings.get(key) ?? null;
    }
  }

  return memoryStrings.get(key) ?? null;
}

export function writeStoredString(
  key: string,
  value: string,
): StoredStringWriteMode {
  const storage = getLocalStorage();

  if (storage) {
    try {
      storage.setItem(key, value);
      memoryStrings.delete(key);
      return "plain";
    } catch {
      // Fall through to memory storage.
    }
  }

  memoryStrings.set(key, value);
  return "memory";
}

export function removeStoredString(key: string) {
  const storage = getLocalStorage();

  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // Fall through to in-memory cleanup.
    }
  }

  memoryStrings.delete(key);
}

export async function readStoredJson<T>(key: string): Promise<T | null> {
  const storedValue = (await idbGet<string>(RECORD_STORE, key)) ?? memoryRecords.get(key);

  if (!storedValue) {
    return null;
  }

  try {
    const rawValue = await decryptPayload(storedValue);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export async function writeStoredJson(
  key: string,
  value: unknown,
): Promise<StoredJsonWriteMode> {
  const rawValue = JSON.stringify(value);
  const encryptedValue = await encryptPayload(rawValue);
  const payload = encryptedValue ?? rawValue;

  try {
    await idbPut(RECORD_STORE, key, payload);
    memoryRecords.delete(key);
    return encryptedValue ? "encrypted" : "plain";
  } catch {
    memoryRecords.set(key, payload);
    return "memory";
  }
}

export async function removeStoredJson(key: string) {
  await idbDelete(RECORD_STORE, key).catch(() => undefined);
  memoryRecords.delete(key);
}
