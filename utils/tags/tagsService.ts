// Tags Service - Manage tags for projects, files, and conversations

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TagAssignment {
  itemId: string;
  itemType: 'project' | 'file' | 'conversation';
  tagIds: string[];
}

export interface TagsStorage {
  tags: Tag[];
  assignments: TagAssignment[];
}

// Predefined tag colors
export const TAG_COLORS = [
  '#667eea', // Purple
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#f44336', // Red
  '#9C27B0', // Deep Purple
  '#00BCD4', // Cyan
  '#8BC34A', // Light Green
  '#FFC107', // Amber
  '#E91E63', // Pink
];

export class TagsService {
  private storageKey = 'eidolon_tags';

  /**
   * Get all tags
   */
  async getAllTags(): Promise<Tag[]> {
    const data = await this.getStorage();
    return data.tags;
  }

  /**
   * Create a new tag
   */
  async createTag(name: string, color?: string): Promise<Tag> {
    const data = await this.getStorage();

    // Check if tag with same name exists
    const existingTag = data.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingTag) {
      return existingTag;
    }

    const tag: Tag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      color: color || TAG_COLORS[data.tags.length % TAG_COLORS.length],
      createdAt: new Date().toISOString()
    };

    data.tags.push(tag);
    await this.setStorage(data);

    return tag;
  }

  /**
   * Update a tag
   */
  async updateTag(tagId: string, updates: Partial<Pick<Tag, 'name' | 'color'>>): Promise<void> {
    const data = await this.getStorage();
    const tag = data.tags.find(t => t.id === tagId);

    if (!tag) {
      throw new Error('Tag not found');
    }

    if (updates.name !== undefined) {
      tag.name = updates.name.trim();
    }
    if (updates.color !== undefined) {
      tag.color = updates.color;
    }

    await this.setStorage(data);
  }

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<void> {
    const data = await this.getStorage();

    // Remove tag
    data.tags = data.tags.filter(t => t.id !== tagId);

    // Remove all assignments
    data.assignments.forEach(assignment => {
      assignment.tagIds = assignment.tagIds.filter(id => id !== tagId);
    });

    // Clean up empty assignments
    data.assignments = data.assignments.filter(a => a.tagIds.length > 0);

    await this.setStorage(data);
  }

  /**
   * Assign tags to an item
   */
  async assignTags(itemId: string, itemType: TagAssignment['itemType'], tagIds: string[]): Promise<void> {
    const data = await this.getStorage();

    let assignment = data.assignments.find(a => a.itemId === itemId && a.itemType === itemType);

    if (!assignment) {
      assignment = {
        itemId,
        itemType,
        tagIds: []
      };
      data.assignments.push(assignment);
    }

    // Add new tags (avoid duplicates)
    tagIds.forEach(tagId => {
      if (!assignment!.tagIds.includes(tagId)) {
        assignment!.tagIds.push(tagId);
      }
    });

    await this.setStorage(data);
  }

  /**
   * Remove tags from an item
   */
  async removeTags(itemId: string, itemType: TagAssignment['itemType'], tagIds: string[]): Promise<void> {
    const data = await this.getStorage();

    const assignment = data.assignments.find(a => a.itemId === itemId && a.itemType === itemType);
    if (!assignment) return;

    assignment.tagIds = assignment.tagIds.filter(id => !tagIds.includes(id));

    // Remove assignment if no tags left
    if (assignment.tagIds.length === 0) {
      data.assignments = data.assignments.filter(a => a.itemId !== itemId || a.itemType !== itemType);
    }

    await this.setStorage(data);
  }

  /**
   * Get tags for a specific item
   */
  async getItemTags(itemId: string, itemType: TagAssignment['itemType']): Promise<Tag[]> {
    const data = await this.getStorage();

    const assignment = data.assignments.find(a => a.itemId === itemId && a.itemType === itemType);
    if (!assignment) return [];

    return data.tags.filter(tag => assignment.tagIds.includes(tag.id));
  }

  /**
   * Get all items with a specific tag
   */
  async getItemsByTag(tagId: string): Promise<TagAssignment[]> {
    const data = await this.getStorage();
    return data.assignments.filter(a => a.tagIds.includes(tagId));
  }

  /**
   * Search tags by name
   */
  async searchTags(query: string): Promise<Tag[]> {
    const data = await this.getStorage();
    const lowerQuery = query.toLowerCase();
    return data.tags.filter(tag => tag.name.toLowerCase().includes(lowerQuery));
  }

  /**
   * Get storage data
   */
  private async getStorage(): Promise<TagsStorage> {
    try {
      const result = await browser.storage.local.get(this.storageKey);
      return result[this.storageKey] || { tags: [], assignments: [] };
    } catch (error) {
      console.error('Failed to get tags storage:', error);
      return { tags: [], assignments: [] };
    }
  }

  /**
   * Set storage data
   */
  private async setStorage(data: TagsStorage): Promise<void> {
    try {
      await browser.storage.local.set({ [this.storageKey]: data });
    } catch (error) {
      console.error('Failed to set tags storage:', error);
      throw error;
    }
  }

  /**
   * Export all tags data
   */
  async exportTags(): Promise<TagsStorage> {
    return this.getStorage();
  }

  /**
   * Import tags data
   */
  async importTags(data: TagsStorage): Promise<void> {
    await this.setStorage(data);
  }

  /**
   * Clear all tags and assignments
   */
  async clearAll(): Promise<void> {
    await this.setStorage({ tags: [], assignments: [] });
  }
}

// Singleton instance
let tagsServiceInstance: TagsService | null = null;

export function getTagsService(): TagsService {
  if (!tagsServiceInstance) {
    tagsServiceInstance = new TagsService();
  }
  return tagsServiceInstance;
}
