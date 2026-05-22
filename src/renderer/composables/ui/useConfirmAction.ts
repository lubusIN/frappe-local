import { ref } from 'vue';

export function useConfirmAction() {
  const isOpen = ref(false);
  const pendingId = ref<string | null>(null);
  const pendingName = ref('');

  const open = (id: string, name: string) => {
    pendingId.value = id;
    pendingName.value = name;
    isOpen.value = true;
  };

  const cancel = () => {
    isOpen.value = false;
    pendingId.value = null;
    pendingName.value = '';
  };

  return { isOpen, pendingId, pendingName, open, cancel };
}
