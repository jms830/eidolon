/**
 * Accessibility Tree Content Script
 * 
 * Generates a semantic DOM tree for Claude to understand page structure.
 * Injects at document_start to capture page before modifications.
 * Maps elements to refs for targeting interactions.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  
  main() {
    // Initialize global element tracking
    (window as any).__eidolonElementMap = {};
    (window as any).__eidolonRefCounter = 0;

    // Role mapping from HTML elements to ARIA roles
    const ROLE_MAP: Record<string, string> = {
      a: 'link',
      button: 'button',
      input: 'textbox',
      select: 'combobox',
      textarea: 'textbox',
      img: 'image',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      h4: 'heading',
      h5: 'heading',
      h6: 'heading',
      nav: 'navigation',
      main: 'main',
      aside: 'complementary',
      footer: 'contentinfo',
      header: 'banner',
      form: 'form',
      table: 'table',
      thead: 'rowgroup',
      tbody: 'rowgroup',
      tr: 'row',
      th: 'columnheader',
      td: 'cell',
      ul: 'list',
      ol: 'list',
      li: 'listitem',
      article: 'article',
      section: 'region',
      dialog: 'dialog',
      menu: 'menu',
      menuitem: 'menuitem',
      checkbox: 'checkbox',
      radio: 'radio',
      slider: 'slider',
      progress: 'progressbar',
      meter: 'meter',
      video: 'video',
      audio: 'audio',
      canvas: 'img',
      svg: 'img',
      iframe: 'document',
    };

    // Input type to role mapping
    const INPUT_ROLE_MAP: Record<string, string> = {
      button: 'button',
      submit: 'button',
      reset: 'button',
      checkbox: 'checkbox',
      radio: 'radio',
      range: 'slider',
      search: 'searchbox',
      email: 'textbox',
      tel: 'textbox',
      url: 'textbox',
      number: 'spinbutton',
      password: 'textbox',
      text: 'textbox',
      file: 'button',
      image: 'button',
      hidden: 'none',
    };

    interface AccessibilityNode {
      ref: string;
      role: string;
      name: string;
      value?: string;
      description?: string;
      focused?: boolean;
      disabled?: boolean;
      checked?: boolean | 'mixed';
      expanded?: boolean;
      selected?: boolean;
      required?: boolean;
      readonly?: boolean;
      level?: number;
      bounds?: { x: number; y: number; width: number; height: number };
      children?: AccessibilityNode[];
    }

    /**
     * Get accessible name for an element
     */
    function getAccessibleName(element: Element): string {
      // Priority 1: aria-label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      // Priority 2: aria-labelledby
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labels = labelledBy.split(' ')
          .map(id => document.getElementById(id)?.textContent)
          .filter(Boolean)
          .join(' ');
        if (labels) return labels.trim();
      }

      // Priority 3: For inputs, check associated label
      if (element instanceof HTMLInputElement || 
          element instanceof HTMLSelectElement || 
          element instanceof HTMLTextAreaElement) {
        // Check for label with 'for' attribute
        const id = element.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label?.textContent) return label.textContent.trim();
        }
        // Check for wrapping label
        const parentLabel = element.closest('label');
        if (parentLabel?.textContent) {
          // Remove the input's value from label text
          return parentLabel.textContent.replace(element.value || '', '').trim();
        }
      }

      // Priority 4: placeholder
      const placeholder = element.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();

      // Priority 5: title
      const title = element.getAttribute('title');
      if (title) return title.trim();

      // Priority 6: alt (for images)
      const alt = element.getAttribute('alt');
      if (alt) return alt.trim();

      // Priority 7: value (for buttons)
      const value = element.getAttribute('value');
      if (value && (element.tagName === 'INPUT' && 
          ['button', 'submit', 'reset'].includes((element as HTMLInputElement).type))) {
        return value.trim();
      }

      // Priority 8: Text content (truncated)
      const text = element.textContent;
      if (text) {
        const trimmed = text.trim().slice(0, 100);
        return trimmed + (text.length > 100 ? '...' : '');
      }

      return '';
    }

    /**
     * Get role for an element
     */
    function getRole(element: Element): string {
      // Explicit role takes precedence
      const explicitRole = element.getAttribute('role');
      if (explicitRole) return explicitRole;

      const tagName = element.tagName.toLowerCase();

      // Special handling for inputs
      if (tagName === 'input') {
        const type = (element as HTMLInputElement).type || 'text';
        return INPUT_ROLE_MAP[type] || 'textbox';
      }

      return ROLE_MAP[tagName] || 'generic';
    }

    /**
     * Check if element is visible
     */
    function isVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      
      return true;
    }

    /**
     * Check if element is interactive
     */
    function isInteractive(element: Element): boolean {
      const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY'];
      if (interactiveTags.includes(element.tagName)) return true;
      
      if (element.getAttribute('tabindex') !== null) return true;
      if (element.getAttribute('onclick') !== null) return true;
      if (element.getAttribute('role') && 
          ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem', 'tab'].includes(
            element.getAttribute('role')!
          )) return true;
      
      return false;
    }

    /**
     * Generate unique ref for element or find existing ref
     */
    function getOrCreateRef(element: Element): string {
      // Check if element already has a ref
      const existingMap = (window as any).__eidolonElementMap;
      for (const [ref, el] of Object.entries(existingMap)) {
        if (el === element) return ref;
      }
      // Generate new ref
      return `ref_${++(window as any).__eidolonRefCounter}`;
    }

    /**
     * Build accessibility tree from element
     */
    function buildTree(
      element: Element,
      maxDepth: number = 10,
      includeHidden: boolean = false,
      currentDepth: number = 0
    ): AccessibilityNode | null {
      if (currentDepth > maxDepth) return null;
      
      // Skip hidden elements unless requested
      if (!includeHidden && !isVisible(element)) return null;

      // Skip script, style, and other non-content elements
      const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD'];
      if (skipTags.includes(element.tagName)) return null;

      const role = getRole(element);
      
      // Skip generic elements without semantic meaning (unless they're interactive)
      if (role === 'generic' && !isInteractive(element) && currentDepth > 0) {
        // Still process children
        const children: AccessibilityNode[] = [];
        for (const child of element.children) {
          const childNode = buildTree(child, maxDepth, includeHidden, currentDepth + 1);
          if (childNode) children.push(childNode);
        }
        // If no meaningful children, skip entirely
        if (children.length === 0) return null;
        // If only one child, bubble it up
        if (children.length === 1) return children[0];
        // Return a group of children
        return {
          ref: getOrCreateRef(element),
          role: 'group',
          name: '',
          children
        };
      }

      const ref = getOrCreateRef(element);
      (window as any).__eidolonElementMap[ref] = element;

      const rect = element.getBoundingClientRect();
      const node: AccessibilityNode = {
        ref,
        role,
        name: getAccessibleName(element),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };

      // Add value for form controls
      if (element instanceof HTMLInputElement || 
          element instanceof HTMLTextAreaElement) {
        node.value = element.value;
      } else if (element instanceof HTMLSelectElement) {
        node.value = element.options[element.selectedIndex]?.text || '';
      }

      // Add states
      if (document.activeElement === element) node.focused = true;
      if ((element as any).disabled) node.disabled = true;
      if ((element as any).checked !== undefined) node.checked = (element as any).checked;
      if ((element as any).required) node.required = true;
      if ((element as any).readOnly) node.readonly = true;
      
      // Check aria-expanded
      const expanded = element.getAttribute('aria-expanded');
      if (expanded) node.expanded = expanded === 'true';
      
      // Check aria-selected
      const selected = element.getAttribute('aria-selected');
      if (selected) node.selected = selected === 'true';

      // Add heading level
      if (role === 'heading') {
        const level = parseInt(element.tagName.charAt(1));
        if (level >= 1 && level <= 6) node.level = level;
      }

      // Add description
      const describedBy = element.getAttribute('aria-describedby');
      if (describedBy) {
        const descriptions = describedBy.split(' ')
          .map(id => document.getElementById(id)?.textContent)
          .filter(Boolean)
          .join(' ');
        if (descriptions) node.description = descriptions.trim();
      }

      // Process children
      const children: AccessibilityNode[] = [];
      for (const child of element.children) {
        const childNode = buildTree(child, maxDepth, includeHidden, currentDepth + 1);
        if (childNode) children.push(childNode);
      }
      if (children.length > 0) node.children = children;

      return node;
    }

    /**
     * Generate accessibility tree for the page
     * Preserves existing refs for elements still in DOM (incremental update)
     */
    (window as any).__generateAccessibilityTree = function(
      maxDepth: number = 10,
      includeHidden: boolean = false,
      rootRef?: string,
      preserveRefs: boolean = true // New option to preserve existing refs
    ): AccessibilityNode | null {
      // If preserveRefs is false or first time, clear everything
      if (!preserveRefs || Object.keys((window as any).__eidolonElementMap).length === 0) {
        (window as any).__eidolonElementMap = {};
        (window as any).__eidolonRefCounter = 0;
      } else {
        // Clean up refs for elements no longer in DOM
        const oldMap = (window as any).__eidolonElementMap;
        const newMap: Record<string, Element> = {};
        for (const [ref, element] of Object.entries(oldMap)) {
          if (document.body.contains(element as Element)) {
            newMap[ref] = element as Element;
          }
        }
        (window as any).__eidolonElementMap = newMap;
      }

      // Find root element
      let root: Element;
      if (rootRef && (window as any).__eidolonElementMap[rootRef]) {
        root = (window as any).__eidolonElementMap[rootRef];
      } else {
        root = document.body;
      }

      return buildTree(root, maxDepth, includeHidden);
    };

    /**
     * Get element by ref
     */
    (window as any).__getElementByRef = function(ref: string): Element | null {
      return (window as any).__eidolonElementMap[ref] || null;
    };

    /**
     * Get bounding rect for ref
     */
    (window as any).__getBoundsByRef = function(ref: string): DOMRect | null {
      const element = (window as any).__eidolonElementMap[ref];
      return element ? element.getBoundingClientRect() : null;
    };

    /**
     * Scroll element into view
     */
    (window as any).__scrollToRef = function(ref: string): boolean {
      const element = (window as any).__eidolonElementMap[ref];
      if (!element) return false;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };

    /**
     * Click element by ref
     */
    (window as any).__clickRef = function(ref: string): boolean {
      const element = (window as any).__eidolonElementMap[ref] as HTMLElement;
      if (!element) return false;
      element.click();
      return true;
    };

    /**
     * Focus element by ref
     */
    (window as any).__focusRef = function(ref: string): boolean {
      const element = (window as any).__eidolonElementMap[ref] as HTMLElement;
      if (!element || typeof element.focus !== 'function') return false;
      element.focus();
      return true;
    };

    /**
     * Set value on element by ref
     */
    (window as any).__setValueByRef = function(ref: string, value: string): boolean {
      const element = (window as any).__eidolonElementMap[ref];
      if (!element) return false;
      
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      
      if (element instanceof HTMLSelectElement) {
        const option = Array.from(element.options).find(o => o.value === value || o.text === value);
        if (option) {
          element.value = option.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      
      return false;
    };

    console.log('[Eidolon] Accessibility tree script loaded');
  }
});
