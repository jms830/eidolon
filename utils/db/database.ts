import Dexie, { type Table } from 'dexie';
import type { 
  ConversationHeader, 
  ConversationContent, 
  Label, 
  Account, 
  AppMetadata,
  ServiceId 
} from './types';

export class EidolonDatabase extends Dexie {
  headers!: Table<ConversationHeader, string>;
  conversations!: Table<ConversationContent, string>;
  labels!: Table<Label, string>;
  accounts!: Table<Account, string>;
  metadata!: Table<AppMetadata, string>;

  constructor() {
    super('eidolon');
    
    this.version(1).stores({
      headers: 'id, serviceId, accountId, orgId, createTime, updateTime, isFavorite, isPinned, isArchived, modifiedAt, *labelIds',
      conversations: 'id, headerId, syncTime',
      labels: 'id, serviceId, accountId, name, createdAt',
      accounts: 'id, serviceId, email, isActive',
      metadata: 'key'
    });
  }
}

export const db = new EidolonDatabase();

export async function getHeader(id: string): Promise<ConversationHeader | undefined> {
  return db.headers.get(id);
}

export async function upsertHeader(header: ConversationHeader): Promise<string> {
  header.modifiedAt = Date.now();
  return db.headers.put(header);
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const header = await db.headers.get(id);
  if (!header) return false;
  
  const newState = !header.isFavorite;
  await db.headers.update(id, {
    isFavorite: newState,
    favoritedAt: newState ? Date.now() : undefined,
    modifiedAt: Date.now()
  });
  return newState;
}

export async function togglePinned(id: string): Promise<boolean> {
  const header = await db.headers.get(id);
  if (!header) return false;
  
  const newState = !header.isPinned;
  await db.headers.update(id, {
    isPinned: newState,
    pinnedAt: newState ? Date.now() : undefined,
    modifiedAt: Date.now()
  });
  return newState;
}

export async function getFavorites(serviceId?: string): Promise<ConversationHeader[]> {
  let query = db.headers.where('isFavorite').equals(1);
  if (serviceId) {
    return (await query.toArray()).filter(h => h.serviceId === serviceId);
  }
  return query.toArray();
}

export async function getPinned(serviceId?: string): Promise<ConversationHeader[]> {
  let query = db.headers.where('isPinned').equals(1);
  if (serviceId) {
    return (await query.toArray()).filter(h => h.serviceId === serviceId);
  }
  return query.toArray();
}

export async function getAllHeaders(serviceId?: string): Promise<ConversationHeader[]> {
  if (serviceId) {
    return db.headers.where('serviceId').equals(serviceId).toArray();
  }
  return db.headers.toArray();
}

export async function addLabel(headerId: string, labelId: string): Promise<void> {
  const header = await db.headers.get(headerId);
  if (!header) return;
  
  if (!header.labelIds.includes(labelId)) {
    header.labelIds.push(labelId);
    header.modifiedAt = Date.now();
    await db.headers.put(header);
  }
}

export async function removeLabel(headerId: string, labelId: string): Promise<void> {
  const header = await db.headers.get(headerId);
  if (!header) return;
  
  header.labelIds = header.labelIds.filter(id => id !== labelId);
  header.modifiedAt = Date.now();
  await db.headers.put(header);
}

export async function getMetadata(key: string): Promise<string | undefined> {
  const meta = await db.metadata.get(key);
  return meta?.value;
}

export async function setMetadata(key: string, value: string): Promise<void> {
  await db.metadata.put({ key, value, modifiedAt: Date.now() });
}
