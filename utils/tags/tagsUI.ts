// Tags UI Components and Helpers

import { getTagsService, Tag, TAG_COLORS } from './tagsService';

const tagsService = getTagsService();

/**
 * Validate tag name input
 */
function validateTagName(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'Tag name cannot be empty';
  }

  if (trimmed.length < 2) {
    return 'Tag name must be at least 2 characters';
  }

  if (trimmed.length > 30) {
    return 'Tag name must be less than 30 characters';
  }

  // Check for invalid characters
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(trimmed)) {
    return 'Tag name contains invalid characters';
  }

  return null;
}

/**
 * Create a tag badge element
 */
export function createTagBadge(tag: Tag, options: {
  removable?: boolean;
  onRemove?: (tagId: string) => void;
  small?: boolean;
} = {}): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `tag-badge${options.small ? ' tag-badge-small' : ''}`;
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: ${tag.color}20;
    color: ${tag.color};
    border: 1px solid ${tag.color}40;
    border-radius: 12px;
    padding: ${options.small ? '4px 10px' : '6px 12px'};
    font-size: ${options.small ? '12px' : '13px'};
    font-weight: 500;
    margin: 2px;
  `;

  const name = document.createElement('span');
  name.textContent = tag.name;
  badge.appendChild(name);

  if (options.removable && options.onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: ${tag.color};
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      padding: 0;
      margin: 0;
      line-height: 1;
    `;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onRemove!(tag.id);
    });
    badge.appendChild(removeBtn);
  }

  return badge;
}

/**
 * Show tag selection modal
 */
export async function showTagSelectionModal(
  itemId: string,
  itemType: 'project' | 'file' | 'conversation',
  currentTags: Tag[]
): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    max-height: 600px;
    overflow-y: auto;
  `;

  const header = document.createElement('h3');
  header.textContent = 'Manage Tags';
  header.style.cssText = 'margin: 0 0 20px; font-size: 20px; font-weight: 600;';
  modal.appendChild(header);

  // Create new tag input
  const createSection = document.createElement('div');
  createSection.style.cssText = 'margin-bottom: 20px;';

  const createInput = document.createElement('input');
  createInput.type = 'text';
  createInput.placeholder = 'Create new tag...';
  createInput.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 8px;
  `;

  const colorPicker = document.createElement('div');
  colorPicker.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;';

  let selectedColor = TAG_COLORS[0];

  TAG_COLORS.forEach(color => {
    const colorBtn = document.createElement('button');
    colorBtn.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: ${color};
      border: 2px solid ${color === selectedColor ? '#333' : 'transparent'};
      cursor: pointer;
      transition: transform 0.2s;
    `;
    colorBtn.addEventListener('click', () => {
      selectedColor = color;
      colorPicker.querySelectorAll('button').forEach(btn => {
        btn.style.border = '2px solid transparent';
      });
      colorBtn.style.border = '2px solid #333';
    });
    colorBtn.addEventListener('mouseenter', () => {
      colorBtn.style.transform = 'scale(1.1)';
    });
    colorBtn.addEventListener('mouseleave', () => {
      colorBtn.style.transform = 'scale(1)';
    });
    colorPicker.appendChild(colorBtn);
  });

  const createBtn = document.createElement('button');
  createBtn.textContent = '+ Create Tag';
  createBtn.style.cssText = `
    padding: 8px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;

  createSection.appendChild(createInput);
  createSection.appendChild(colorPicker);
  createSection.appendChild(createBtn);
  modal.appendChild(createSection);

  // Available tags list
  const tagsListContainer = document.createElement('div');
  tagsListContainer.style.cssText = 'max-height: 300px; overflow-y: auto;';
  modal.appendChild(tagsListContainer);

  const currentTagIds = new Set(currentTags.map(t => t.id));

  async function renderTagsList() {
    tagsListContainer.textContent = '';

    const allTags = await tagsService.getAllTags();

    if (allTags.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'No tags yet. Create one above!';
      emptyMsg.style.cssText = 'color: #999; text-align: center; padding: 20px;';
      tagsListContainer.appendChild(emptyMsg);
      return;
    }

    allTags.forEach(tag => {
      const tagItem = document.createElement('div');
      tagItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: background 0.2s;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = currentTagIds.has(tag.id);
      checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';

      const badge = createTagBadge(tag);

      tagItem.appendChild(checkbox);
      tagItem.appendChild(badge);

      tagItem.addEventListener('click', async () => {
        checkbox.checked = !checkbox.checked;

        if (checkbox.checked) {
          currentTagIds.add(tag.id);
          await tagsService.assignTags(itemId, itemType, [tag.id]);
        } else {
          currentTagIds.delete(tag.id);
          await tagsService.removeTags(itemId, itemType, [tag.id]);
        }
      });

      tagItem.addEventListener('mouseenter', () => {
        tagItem.style.background = '#f5f7fa';
      });

      tagItem.addEventListener('mouseleave', () => {
        tagItem.style.background = 'transparent';
      });

      tagsListContainer.appendChild(tagItem);
    });
  }

  await renderTagsList();

  // Create tag handler
  createBtn.addEventListener('click', async () => {
    const name = createInput.value.trim();
    if (!name) return;

    // Validate tag name
    const validationError = validateTagName(name);
    if (validationError) {
      alert(`Invalid tag name: ${validationError}`);
      return;
    }

    try {
      const newTag = await tagsService.createTag(name, selectedColor);
      createInput.value = '';
      await renderTagsList();
    } catch (error) {
      console.error('Failed to create tag:', error);
      alert('Failed to create tag. Please try again.');
    }
  });

  createInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      createBtn.click();
    }
  });

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Done';
  closeBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    margin-top: 20px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });
  modal.appendChild(closeBtn);

  overlay.appendChild(modal);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

/**
 * Create a tag filter dropdown
 */
export async function createTagFilter(
  onChange: (selectedTagIds: string[]) => void
): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.style.cssText = 'position: relative;';

  const button = document.createElement('button');
  button.textContent = '🏷️ Tags';
  button.className = 'action-btn';
  button.style.cssText = `
    padding: 8px 16px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  `;

  const dropdown = document.createElement('div');
  dropdown.style.cssText = `
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 12px;
    min-width: 200px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 10;
  `;

  const selectedTagIds = new Set<string>();

  async function renderDropdown() {
    dropdown.textContent = '';

    const allTags = await tagsService.getAllTags();

    if (allTags.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'No tags available';
      emptyMsg.style.cssText = 'color: #999; font-size: 13px;';
      dropdown.appendChild(emptyMsg);
      return;
    }

    allTags.forEach(tag => {
      const tagItem = document.createElement('label');
      tagItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.2s;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedTagIds.has(tag.id);

      const badge = createTagBadge(tag, { small: true });

      tagItem.appendChild(checkbox);
      tagItem.appendChild(badge);

      tagItem.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;

        if (checkbox.checked) {
          selectedTagIds.add(tag.id);
        } else {
          selectedTagIds.delete(tag.id);
        }

        onChange(Array.from(selectedTagIds));
      });

      tagItem.addEventListener('mouseenter', () => {
        tagItem.style.background = '#f5f7fa';
      });

      tagItem.addEventListener('mouseleave', () => {
        tagItem.style.background = 'transparent';
      });

      dropdown.appendChild(tagItem);
    });
  }

  button.addEventListener('click', async () => {
    const isVisible = dropdown.style.display !== 'none';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      await renderDropdown();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  });

  container.appendChild(button);
  container.appendChild(dropdown);

  return container;
}
