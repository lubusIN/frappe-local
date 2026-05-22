import { ref, type Component } from 'vue';

export type PageHeaderAction = {
  readonly id: string;
  readonly label: string;
  readonly variant?: 'primary' | 'subtle';
  readonly disabled?: boolean;
  readonly icon?: Component;
  readonly loading?: boolean;
  readonly onClick: () => void | Promise<void>;
};

const actions = ref<PageHeaderAction[]>([]);

export const usePageHeaderActions = () => {
  const setActions = (nextActions: PageHeaderAction[]): void => {
    // Prevent redundant updates that can cause reactivity loops
    const currentIds = actions.value.map(a => `${a.id}-${a.label}-${a.disabled}`).join('|');
    const nextIds = nextActions.map(a => `${a.id}-${a.label}-${a.disabled}`).join('|');
    
    if (currentIds === nextIds) return;
    
    actions.value = nextActions;
  };

  const clearActions = (): void => {
    actions.value = [];
  };

  return {
    actions,
    setActions,
    clearActions,
  };
};
