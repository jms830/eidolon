// SearchService - Main interface for search functionality

export interface SearchableItem {
  id: string;
  type: 'project' | 'file' | 'conversation';
  title: string;
  content?: string;
  description?: string;
  metadata: {
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    projectId?: string;
    projectName?: string;
  };
}

export interface SearchFilters {
  type?: SearchableItem['type'][];
  tags?: string[];
  dateRange?: { start?: string; end?: string };
  projectId?: string;
}

export class SearchService {
  private worker: Worker | null = null;
  private indexedCount = 0;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    try {
      // Create worker from the indexWorker file
      this.worker = new Worker(
        new URL('./indexWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { action, ...data } = e.data;
        const handler = this.messageHandlers.get(action);
        if (handler) {
          handler(data);
        }
      };

      this.worker.onerror = (error) => {
        console.error('Search worker error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize search worker:', error);
    }
  }

  /**
   * Index items for searching
   */
  async indexItems(items: SearchableItem[]): Promise<void> {
    return new Promise((resolve) => {
      this.messageHandlers.set('indexed', (data) => {
        this.indexedCount = data.itemCount;
        this.messageHandlers.delete('indexed');
        resolve();
      });

      this.worker?.postMessage({
        action: 'index',
        data: { items }
      });
    });
  }

  /**
   * Search indexed items
   */
  async search(query: string, filters?: SearchFilters): Promise<SearchableItem[]> {
    return new Promise((resolve) => {
      this.messageHandlers.set('results', (data) => {
        this.messageHandlers.delete('results');
        resolve(data.results);
      });

      this.worker?.postMessage({
        action: 'search',
        data: { query, filters }
      });
    });
  }

  /**
   * Add a single item to the index
   */
  async addItem(item: SearchableItem): Promise<void> {
    return new Promise((resolve) => {
      this.messageHandlers.set('item-added', () => {
        this.indexedCount++;
        this.messageHandlers.delete('item-added');
        resolve();
      });

      this.worker?.postMessage({
        action: 'add-item',
        data: { item }
      });
    });
  }

  /**
   * Remove an item from the index
   */
  async removeItem(itemId: string): Promise<void> {
    return new Promise((resolve) => {
      this.messageHandlers.set('item-removed', () => {
        this.indexedCount--;
        this.messageHandlers.delete('item-removed');
        resolve();
      });

      this.worker?.postMessage({
        action: 'remove-item',
        data: { itemId }
      });
    });
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    return new Promise((resolve) => {
      this.messageHandlers.set('cleared', () => {
        this.indexedCount = 0;
        this.messageHandlers.delete('cleared');
        resolve();
      });

      this.worker?.postMessage({
        action: 'clear'
      });
    });
  }

  /**
   * Get the number of indexed items
   */
  getIndexedCount(): number {
    return this.indexedCount;
  }

  /**
   * Cleanup worker
   */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.messageHandlers.clear();
  }
}

// Singleton instance
let searchServiceInstance: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService();
  }
  return searchServiceInstance;
}

// Helper to convert API data to searchable items
export function projectToSearchableItem(project: any): SearchableItem {
  return {
    id: project.uuid || project.id,
    type: 'project',
    title: project.name,
    description: project.description,
    metadata: {
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      tags: project.tags || []
    }
  };
}

export function fileToSearchableItem(file: any, projectId: string, projectName: string): SearchableItem {
  return {
    id: file.uuid || file.id,
    type: 'file',
    title: file.file_name || file.name,
    content: file.content,
    metadata: {
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      projectId,
      projectName
    }
  };
}

export function conversationToSearchableItem(conversation: any, projectName?: string): SearchableItem {
  return {
    id: conversation.uuid || conversation.id,
    type: 'conversation',
    title: conversation.name,
    description: conversation.summary,
    metadata: {
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      projectId: conversation.project_uuid,
      projectName
    }
  };
}
