import { ref, type Component } from 'vue';

export type PageHeaderAction = {
  readonly id: string;
  readonly label: string;
  readonly variant?: 'primary' | 'subtle';
  readonly disabled?: boolean;
  readonly icon?: Component;
  readonly onClick: () => void | Promise<void>;
};

const actions = ref<PageHeaderAction[]>([]);

export const usePageHeaderActions = () => {
  const setActions = (nextActions: PageHeaderAction[]): void => {
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
