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

    // ============================================================================
    // DOM Caching for Performance (BrowserMCP pattern)
    // ============================================================================
    
    const DOM_CACHE = {
      boundingRects: new WeakMap<Element, DOMRect>(),
      computedStyles: new WeakMap<Element, CSSStyleDeclaration>(),
      clearCache: () => {
        DOM_CACHE.boundingRects = new WeakMap();
        DOM_CACHE.computedStyles = new WeakMap();
      }
    };

    function getCachedRect(element: Element): DOMRect {
      let rect = DOM_CACHE.boundingRects.get(element);
      if (!rect) {
        rect = element.getBoundingClientRect();
        DOM_CACHE.boundingRects.set(element, rect);
      }
      return rect;
    }

    function getCachedStyle(element: Element): CSSStyleDeclaration {
      let style = DOM_CACHE.computedStyles.get(element);
      if (!style) {
        style = window.getComputedStyle(element);
        DOM_CACHE.computedStyles.set(element, style);
      }
      return style;
    }

    // Expose cache clear function for manual refresh
    (window as any).__clearDOMCache = DOM_CACHE.clearCache;

    // ============================================================================
    // Role mapping from HTML elements to ARIA roles
    // ============================================================================
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
     * Check if element is visible (using cached styles)
     */
    function isVisible(element: Element): boolean {
      const style = getCachedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      
      const rect = getCachedRect(element);
      if (rect.width === 0 && rect.height === 0) return false;
      
      return true;
    }

    /**
     * Check if element is interactive (BrowserMCP cursor-based detection)
     */
    function isInteractive(element: Element): boolean {
      // FAST PATH: Check cursor style first - catches ~90% of interactive elements
      const style = getCachedStyle(element);
      const interactiveCursors = new Set([
        'pointer',    // Links/clickable elements
        'text',       // Text selection (inputs)
        'grab',       // Draggable elements
        'grabbing',   // Currently dragging
        'move',       // Movable elements
        'cell',       // Table cell selection
        'crosshair',  // Precise selection
        'copy',       // Copy operation
        'alias',      // Alias creation
        'context-menu', // Context menu available
        'col-resize', // Column resize
        'row-resize', // Row resize
        'n-resize', 's-resize', 'e-resize', 'w-resize',
        'ne-resize', 'nw-resize', 'se-resize', 'sw-resize',
        'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
        'zoom-in', 'zoom-out',
        'all-scroll',
        'vertical-text',
      ]);
      
      if (interactiveCursors.has(style.cursor)) return true;
      
      // Standard interactive elements
      const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY'];
      if (interactiveTags.includes(element.tagName)) {
        // Check if not disabled
        if ((element as HTMLElement).hasAttribute('disabled')) return false;
        return true;
      }
      
      // Check for tabindex (makes element focusable/interactive)
      const tabindex = element.getAttribute('tabindex');
      if (tabindex !== null && tabindex !== '-1') return true;
      
      // Check for event handlers
      if (element.getAttribute('onclick') !== null) return true;
      if (element.getAttribute('onmousedown') !== null) return true;
      if (element.getAttribute('onmouseup') !== null) return true;
      
      // Check for interactive ARIA roles
      const role = element.getAttribute('role');
      if (role) {
        const interactiveRoles = new Set([
          'button', 'link', 'checkbox', 'radio', 'textbox', 'combobox',
          'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab',
          'switch', 'option', 'slider', 'spinbutton', 'searchbox',
          'treeitem', 'gridcell', 'listbox'
        ]);
        if (interactiveRoles.has(role)) return true;
      }
      
      // Check for contenteditable
      if (element.getAttribute('contenteditable') === 'true') return true;
      
      return false;
    }

    /**
     * Check if element is in viewport (with optional expansion)
     */
    function isInViewport(element: Element, expansion: number = 0): boolean {
      const rect = getCachedRect(element);
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      return !(
        rect.bottom < -expansion ||
        rect.top > viewportHeight + expansion ||
        rect.right < -expansion ||
        rect.left > viewportWidth + expansion
      );
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

    /**
     * Validate ref - check if element still exists and is valid
     * Returns validation result with suggestions if ref is invalid
     */
    (window as any).__validateRef = function(ref: string): {
      valid: boolean;
      exists: boolean;
      visible: boolean;
      enabled: boolean;
      error?: string;
      suggestion?: string;
      elementInfo?: {
        role: string;
        name: string;
        bounds: { x: number; y: number; width: number; height: number } | null;
      };
    } {
      const element = (window as any).__eidolonElementMap[ref];
      
      // Check if ref exists in map
      if (!element) {
        return {
          valid: false,
          exists: false,
          visible: false,
          enabled: false,
          error: `Element with ref "${ref}" not found in current map. The page may have changed.`,
          suggestion: 'Use read_page to get fresh element references.'
        };
      }
      
      // Check if element is still in DOM
      if (!document.body.contains(element)) {
        // Remove stale ref
        delete (window as any).__eidolonElementMap[ref];
        return {
          valid: false,
          exists: false,
          visible: false,
          enabled: false,
          error: `Element with ref "${ref}" is no longer in the DOM. It may have been removed.`,
          suggestion: 'Use read_page to get fresh element references.'
        };
      }
      
      // Check visibility
      const style = window.getComputedStyle(element);
      const isVisible = style.display !== 'none' && 
                        style.visibility !== 'hidden' && 
                        parseFloat(style.opacity) > 0;
      
      if (!isVisible) {
        return {
          valid: false,
          exists: true,
          visible: false,
          enabled: true,
          error: `Element with ref "${ref}" exists but is not visible (hidden by CSS).`,
          suggestion: 'The element may need to be revealed first (e.g., by clicking a menu or expanding a section).'
        };
      }
      
      // Check if disabled
      const isDisabled = (element as HTMLElement).hasAttribute('disabled') || 
                         element.getAttribute('aria-disabled') === 'true';
      
      // Get element info
      const rect = element.getBoundingClientRect();
      const role = getRole(element);
      const name = getAccessibleName(element);
      
      return {
        valid: true,
        exists: true,
        visible: isVisible,
        enabled: !isDisabled,
        elementInfo: {
          role,
          name: name || '(unnamed)',
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        }
      };
    };

    /**
     * Find similar elements when ref is invalid
     * Helps Claude recover from stale refs
     */
    (window as any).__findSimilarElement = function(
      targetRole: string,
      targetName: string,
      maxResults: number = 5
    ): Array<{
      ref: string;
      role: string;
      name: string;
      similarity: number;
    }> {
      const results: Array<{
        ref: string;
        role: string;
        name: string;
        similarity: number;
      }> = [];
      
      // Simple Levenshtein distance for name matching
      const levenshtein = (a: string, b: string): number => {
        const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
          Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
        );
        for (let i = 1; i <= a.length; i++) {
          for (let j = 1; j <= b.length; j++) {
            matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
          }
        }
        return matrix[a.length][b.length];
      };
      
      const calculateSimilarity = (name1: string, name2: string): number => {
        if (!name1 || !name2) return 0;
        const maxLen = Math.max(name1.length, name2.length);
        if (maxLen === 0) return 1;
        const distance = levenshtein(name1.toLowerCase(), name2.toLowerCase());
        return 1 - distance / maxLen;
      };
      
      // Search through current element map
      const elementMap = (window as any).__eidolonElementMap;
      for (const [ref, element] of Object.entries(elementMap)) {
        if (!document.body.contains(element as Element)) continue;
        if (!isVisible(element as Element)) continue;
        
        const role = getRole(element as Element);
        const name = getAccessibleName(element as Element);
        
        // Calculate similarity score
        let similarity = 0;
        if (role === targetRole) similarity += 0.3;
        similarity += calculateSimilarity(name, targetName) * 0.7;
        
        if (similarity > 0.3) {
          results.push({ ref, role, name, similarity });
        }
      }
      
      // Sort by similarity and return top results
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, maxResults);
    };

    /**
     * Highlight element by ref (for visual debugging)
     */
    (window as any).__highlightRef = function(ref: string, duration: number = 2000): boolean {
      const element = (window as any).__eidolonElementMap[ref] as HTMLElement;
      if (!element) return false;
      
      // Store original styles
      const originalOutline = element.style.outline;
      const originalOutlineOffset = element.style.outlineOffset;
      const originalTransition = element.style.transition;
      
      // Apply highlight
      element.style.transition = 'outline 0.2s ease-in-out';
      element.style.outline = '3px solid #ff6b00';
      element.style.outlineOffset = '2px';
      
      // Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Remove highlight after duration
      setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.outlineOffset = originalOutlineOffset;
        element.style.transition = originalTransition;
      }, duration);
      
      return true;
    };

    // ============================================================================
    // Scrollable Container Detection (BrowserMCP pattern)
    // ============================================================================
    
    /**
     * Find the most appropriate scrollable container on the page
     * Returns null if only window scrolling should be used
     */
    (window as any).__findScrollableContainer = function(): {
      element: Element;
      tagName: string;
      id: string;
      className: string;
      scrollHeight: number;
      scrollWidth: number;
      clientHeight: number;
      clientWidth: number;
    } | null {
      function isScrollable(el: Element): boolean {
        const style = getCachedStyle(el);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const overflow = style.overflow;
        
        const hasVerticalScroll = el.scrollHeight > el.clientHeight;
        const hasHorizontalScroll = el.scrollWidth > el.clientWidth;
        
        const allowsVerticalScroll = 
          overflowY === 'auto' || overflowY === 'scroll' || 
          overflow === 'auto' || overflow === 'scroll';
        const allowsHorizontalScroll = 
          overflowX === 'auto' || overflowX === 'scroll' || 
          overflow === 'auto' || overflow === 'scroll';
        
        return (hasVerticalScroll && allowsVerticalScroll) || 
               (hasHorizontalScroll && allowsHorizontalScroll);
      }
      
      function getElementArea(el: Element): number {
        const rect = getCachedRect(el);
        return rect.width * rect.height;
      }
      
      // Find all scrollable elements
      const allElements = Array.from(document.querySelectorAll('*'));
      const scrollableElements = allElements
        .filter(el => isScrollable(el) && el.tagName !== 'BODY' && el.tagName !== 'HTML')
        .sort((a, b) => getElementArea(b) - getElementArea(a));
      
      if (scrollableElements.length === 0) {
        return null;
      }
      
      const bestScrollable = scrollableElements[0];
      return {
        element: bestScrollable,
        tagName: bestScrollable.tagName,
        id: (bestScrollable as HTMLElement).id || '',
        className: bestScrollable.className || '',
        scrollHeight: bestScrollable.scrollHeight,
        scrollWidth: bestScrollable.scrollWidth,
        clientHeight: bestScrollable.clientHeight,
        clientWidth: bestScrollable.clientWidth,
      };
    };

    // ============================================================================
    // DOM Snapshot for Change Detection (BrowserMCP pattern)
    // ============================================================================
    
    /**
     * Generate a snapshot of the current DOM state for change detection
     * Returns a hash-like string that changes when interactive elements change
     */
    (window as any).__generateDOMSnapshot = function(): string {
      const elementMap = (window as any).__eidolonElementMap;
      const elements: string[] = [];
      
      for (const [ref, element] of Object.entries(elementMap)) {
        if (!document.body.contains(element as Element)) continue;
        if (!isVisible(element as Element)) continue;
        
        const el = element as Element;
        const role = getRole(el);
        const name = getAccessibleName(el).slice(0, 30);
        const disabled = (el as HTMLElement).hasAttribute('disabled') ? 'd' : '';
        
        elements.push(`${ref}:${role}:${name}:${disabled}`);
      }
      
      // Sort for consistency
      elements.sort();
      
      // Return count + simplified hash
      return `${elements.length}:${elements.join('|')}`;
    };

    /**
     * Compare two DOM snapshots to detect significant changes
     */
    (window as any).__isDOMChanged = function(before: string, after: string): boolean {
      if (before === after) return false;
      
      const [beforeCount] = before.split(':');
      const [afterCount] = after.split(':');
      
      // Element count change is significant
      if (beforeCount !== afterCount) return true;
      
      // Content changed
      return before !== after;
    };

    // ============================================================================
    // Interactive Elements with Index (BrowserMCP numbered overlay support)
    // ============================================================================
    
    /**
     * Get all interactive elements with their index and bounds
     * Used for numbered overlay display
     */
    (window as any).__getInteractiveElementsWithIndex = function(): Array<{
      index: number;
      ref: string;
      role: string;
      name: string;
      bounds: { x: number; y: number; width: number; height: number };
      isInViewport: boolean;
    }> {
      const elementMap = (window as any).__eidolonElementMap;
      const results: Array<{
        index: number;
        ref: string;
        role: string;
        name: string;
        bounds: { x: number; y: number; width: number; height: number };
        isInViewport: boolean;
      }> = [];
      
      let index = 0;
      for (const [ref, element] of Object.entries(elementMap)) {
        const el = element as Element;
        if (!document.body.contains(el)) continue;
        if (!isVisible(el)) continue;
        if (!isInteractive(el)) continue;
        
        const rect = getCachedRect(el);
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const inViewport = !(
          rect.bottom < 0 ||
          rect.top > viewportHeight ||
          rect.right < 0 ||
          rect.left > viewportWidth
        );
        
        results.push({
          index,
          ref,
          role: getRole(el),
          name: getAccessibleName(el),
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          isInViewport: inViewport,
        });
        
        index++;
      }
      
      return results;
    };

    /**
     * Get scroll position info for the page
     */
    (window as any).__getScrollInfo = function(): {
      scrollY: number;
      scrollX: number;
      viewportHeight: number;
      viewportWidth: number;
      totalHeight: number;
      totalWidth: number;
      pixelsAbove: number;
      pixelsBelow: number;
    } {
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const totalHeight = document.documentElement.scrollHeight;
      const totalWidth = document.documentElement.scrollWidth;
      
      return {
        scrollY,
        scrollX,
        viewportHeight,
        viewportWidth,
        totalHeight,
        totalWidth,
        pixelsAbove: scrollY,
        pixelsBelow: totalHeight - (scrollY + viewportHeight),
      };
    };

    console.log('[Eidolon] Accessibility tree script loaded (with BrowserMCP enhancements)');
  }
});
