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
  private items: SearchableItem[] = [];
  private termMap: Map<string, Set<string>> = new Map();

  constructor() {
    // No worker needed - using inline search
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);
  }

  private buildIndex(items: SearchableItem[]): void {
    this.items = items;
    this.termMap.clear();

    items.forEach(item => {
      const searchableText = [
        item.title,
        item.content || '',
        item.description || '',
        item.metadata.projectName || '',
        ...(item.metadata.tags || [])
      ].join(' ');

      const terms = this.tokenize(searchableText);
      terms.forEach(term => {
        if (!this.termMap.has(term)) {
          this.termMap.set(term, new Set());
        }
        this.termMap.get(term)!.add(item.id);
      });
    });
  }

  /**
   * Index items for searching
   */
  async indexItems(items: SearchableItem[]): Promise<void> {
    this.buildIndex(items);
  }

  /**
   * Search indexed items
   */
  async search(query: string, filters?: SearchFilters): Promise<SearchableItem[]> {
    if (!query.trim()) return [];

    const queryTerms = this.tokenize(query);
    const itemScores = new Map<string, number>();

    // Find items matching query terms
    queryTerms.forEach(term => {
      // Exact matches
      const exactIds = this.termMap.get(term) || new Set();
      exactIds.forEach(id => {
        itemScores.set(id, (itemScores.get(id) || 0) + 10);
      });

      // Partial matches (substring)
      this.termMap.forEach((ids, indexedTerm) => {
        if (indexedTerm.includes(term) || term.includes(indexedTerm)) {
          ids.forEach(id => {
            if (!exactIds.has(id)) {
              itemScores.set(id, (itemScores.get(id) || 0) + 5);
            }
          });
        }
      });
    });

    // Get items and apply filters
    let results = Array.from(itemScores.entries())
      .map(([id, score]) => ({
        item: this.items.find(item => item.id === id)!,
        score
      }))
      .filter(result => result.item);

    // Apply filters
    if (filters) {
      if (filters.type && filters.type.length > 0) {
        results = results.filter(r => filters.type!.includes(r.item.type));
      }

      if (filters.tags && filters.tags.length > 0) {
        results = results.filter(r =>
          filters.tags!.some(tag => r.item.metadata.tags?.includes(tag))
        );
      }

      if (filters.projectId) {
        results = results.filter(r => r.item.metadata.projectId === filters.projectId);
      }

      if (filters.dateRange) {
        results = results.filter(r => {
          const itemDate = r.item.metadata.updatedAt || r.item.metadata.createdAt;
          if (!itemDate) return true;

          if (filters.dateRange!.start && itemDate < filters.dateRange!.start) {
            return false;
          }
          if (filters.dateRange!.end && itemDate > filters.dateRange!.end) {
            return false;
          }
          return true;
        });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return results.map(r => r.item);
  }

  /**
   * Add a single item to the index
   */
  async addItem(item: SearchableItem): Promise<void> {
    this.items.push(item);
    const terms = this.tokenize([
      item.title,
      item.content || '',
      item.description || ''
    ].join(' '));

    terms.forEach(term => {
      if (!this.termMap.has(term)) {
        this.termMap.set(term, new Set());
      }
      this.termMap.get(term)!.add(item.id);
    });
  }

  /**
   * Remove an item from the index
   */
  async removeItem(itemId: string): Promise<void> {
    this.items = this.items.filter(item => item.id !== itemId);
    this.termMap.forEach((ids, term) => {
      ids.delete(itemId);
      if (ids.size === 0) {
        this.termMap.delete(term);
      }
    });
  }

  /**
   * Clear the entire index
   */
  async clearIndex(): Promise<void> {
    this.items = [];
    this.termMap.clear();
  }

  /**
   * Get the number of indexed items
   */
  getIndexedCount(): number {
    return this.items.length;
  }

  /**
   * Cleanup (no-op since no worker)
   */
  destroy(): void {
    this.items = [];
    this.termMap.clear();
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
