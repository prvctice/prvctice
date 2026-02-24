/**
 * useDocumentBrowser Composable
 * Manages document browser modal state: open/close, view mode, sort, filter,
 * and folder navigation.
 * Module-scoped refs provide singleton behavior across all consumers.
 */
import { ref, type Ref } from 'vue';

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'uploadedAt' | 'size';
export type SortDirection = 'asc' | 'desc';
export type FilterType = 'all' | 'pdf' | 'image' | 'document' | 'other';

const isOpen: Ref<boolean> = ref(false);
const viewMode: Ref<ViewMode> = ref('grid');
const sortField: Ref<SortField> = ref('uploadedAt');
const sortDirection: Ref<SortDirection> = ref('desc');
const filterType: Ref<FilterType> = ref('all');
const currentFolder: Ref<string | null> = ref(null);

export interface UseDocumentBrowserReturn {
  isOpen: Ref<boolean>;
  viewMode: Ref<ViewMode>;
  sortField: Ref<SortField>;
  sortDirection: Ref<SortDirection>;
  filterType: Ref<FilterType>;
  currentFolder: Ref<string | null>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  enterFolder: (name: string) => void;
  goBack: () => void;
}

export function useDocumentBrowser(): UseDocumentBrowserReturn {
  function open(): void {
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    currentFolder.value = null;
  }

  function toggle(): void {
    isOpen.value = !isOpen.value;
    if (!isOpen.value) currentFolder.value = null;
  }

  function enterFolder(name: string): void {
    currentFolder.value = name;
  }

  function goBack(): void {
    currentFolder.value = null;
  }

  return {
    isOpen,
    viewMode,
    sortField,
    sortDirection,
    filterType,
    currentFolder,
    open,
    close,
    toggle,
    enterFolder,
    goBack,
  };
}
