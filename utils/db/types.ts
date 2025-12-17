export type ServiceId = 'claude' | 'chatgpt' | 'gemini' | 'deepseek' | 'grok';

export interface ConversationHeader {
  id: string;
  serviceId: ServiceId;
  accountId?: string;
  orgId?: string;
  title: string;
  createTime: number;
  updateTime: number;
  messageCount?: number;
  
  isFavorite: boolean;
  favoritedAt?: number;
  isPinned: boolean;
  pinnedAt?: number;
  isArchived: boolean;
  archivedAt?: number;
  
  labelIds: string[];
  
  syncTime?: number;
  modifiedAt: number;
}

export interface ConversationContent {
  id: string;
  headerId: string;
  content: string;
  syncTime?: number;
}

export interface Label {
  id: string;
  serviceId: ServiceId;
  accountId?: string;
  name: string;
  color: string;
  createdAt: number;
  modifiedAt: number;
}

export interface Account {
  id: string;
  serviceId: ServiceId;
  email?: string;
  name?: string;
  isActive: boolean;
  createdAt: number;
}

export interface AppMetadata {
  key: string;
  value: string;
  modifiedAt: number;
}
