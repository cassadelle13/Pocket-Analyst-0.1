export type BackgroundMediaRecord = {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: string;
};

const DB_NAME = "pa-media";
const DB_VERSION = 1;
const STORE = "media";

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
};

export const saveBackgroundMedia = async (file: File): Promise<{ id: string; mime: string }> => {
  const db = await openDb();
  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const record: BackgroundMediaRecord = {
    id,
    blob: file,
    mime: file.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save media"));
    tx.objectStore(STORE).put(record);
  });

  db.close();
  return { id, mime: record.mime };
};

export const loadBackgroundMedia = async (id: string): Promise<BackgroundMediaRecord | null> => {
  const db = await openDb();
  const rec = await new Promise<BackgroundMediaRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as BackgroundMediaRecord) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to load media"));
  });
  db.close();
  return rec;
};

export const deleteBackgroundMedia = async (id: string): Promise<void> => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete media"));
    tx.objectStore(STORE).delete(id);
  });
  db.close();
};
