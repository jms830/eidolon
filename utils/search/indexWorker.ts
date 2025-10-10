// Web Worker for non-blocking search operations

interface SearchableItem {
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

interface SearchIndex {
  items: SearchableItem[];
  termMap: Map<string, Set<string>>; // term -> item IDs
}

let searchIndex: SearchIndex = {
  items: [],
  termMap: new Map()
};

// Tokenize text into searchable terms
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(term => term.length > 2); // Ignore very short terms
}

// Build search index from items
function buildIndex(items: SearchableItem[]): void {
  searchIndex.items = items;
  searchIndex.termMap.clear();

  items.forEach(item => {
    const searchableText = [
      item.title,
      item.content || '',
      item.description || '',
      item.metadata.projectName || '',
      ...(item.metadata.tags || [])
    ].join(' ');

    const terms = tokenize(searchableText);
    terms.forEach(term => {
      if (!searchIndex.termMap.has(term)) {
        searchIndex.termMap.set(term, new Set());
      }
      searchIndex.termMap.get(term)!.add(item.id);
    });
  });
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Fuzzy match a term against index terms
function fuzzyMatch(query: string, maxDistance: number = 2): Set<string> {
  const matchedIds = new Set<string>();

  searchIndex.termMap.forEach((ids, indexedTerm) => {
    if (indexedTerm.includes(query) || query.includes(indexedTerm)) {
      ids.forEach(id => matchedIds.add(id));
    } else if (levenshteinDistance(query, indexedTerm) <= maxDistance) {
      ids.forEach(id => matchedIds.add(id));
    }
  });

  return matchedIds;
}

// Search function with ranking
function search(
  query: string,
  filters?: {
    type?: SearchableItem['type'][];
    tags?: string[];
    dateRange?: { start?: string; end?: string };
    projectId?: string;
  }
): SearchableItem[] {
  if (!query.trim()) return [];

  const queryTerms = tokenize(query);
  const itemScores = new Map<string, number>();

  // Find items matching query terms
  queryTerms.forEach(term => {
    // Exact matches
    const exactIds = searchIndex.termMap.get(term) || new Set();
    exactIds.forEach(id => {
      itemScores.set(id, (itemScores.get(id) || 0) + 10);
    });

    // Fuzzy matches
    const fuzzyIds = fuzzyMatch(term);
    fuzzyIds.forEach(id => {
      if (!exactIds.has(id)) {
        itemScores.set(id, (itemScores.get(id) || 0) + 5);
      }
    });
  });

  // Get items and apply filters
  let results = Array.from(itemScores.entries())
    .map(([id, score]) => ({
      item: searchIndex.items.find(item => item.id === id)!,
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

// Message handler for the worker
self.onmessage = (e: MessageEvent) => {
  const { action, data } = e.data;

  switch (action) {
    case 'index':
      buildIndex(data.items);
      self.postMessage({ action: 'indexed', itemCount: data.items.length });
      break;

    case 'search':
      const results = search(data.query, data.filters);
      self.postMessage({ action: 'results', results });
      break;

    case 'add-item':
      searchIndex.items.push(data.item);
      const terms = tokenize([
        data.item.title,
        data.item.content || '',
        data.item.description || ''
      ].join(' '));

      terms.forEach(term => {
        if (!searchIndex.termMap.has(term)) {
          searchIndex.termMap.set(term, new Set());
        }
        searchIndex.termMap.get(term)!.add(data.item.id);
      });

      self.postMessage({ action: 'item-added', itemId: data.item.id });
      break;

    case 'remove-item':
      searchIndex.items = searchIndex.items.filter(item => item.id !== data.itemId);
      searchIndex.termMap.forEach((ids, term) => {
        ids.delete(data.itemId);
        if (ids.size === 0) {
          searchIndex.termMap.delete(term);
        }
      });
      self.postMessage({ action: 'item-removed', itemId: data.itemId });
      break;

    case 'clear':
      searchIndex.items = [];
      searchIndex.termMap.clear();
      self.postMessage({ action: 'cleared' });
      break;

    default:
      self.postMessage({ action: 'error', error: 'Unknown action' });
  }
};

export {};
