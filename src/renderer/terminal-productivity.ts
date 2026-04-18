export const appendCommandHistory = (
  history: readonly string[],
  command: string,
  limit: number = 30
): string[] => {
  const trimmed = command.trim();
  if (!trimmed) {
    return [...history];
  }

  const nextHistory = [...history.filter((entry) => entry !== trimmed), trimmed];
  return nextHistory.slice(Math.max(0, nextHistory.length - limit));
};

export const moveHistoryCursor = (
  history: readonly string[],
  currentIndex: number,
  direction: 'older' | 'newer'
): number => {
  if (history.length === 0) {
    return -1;
  }

  if (direction === 'older') {
    if (currentIndex === -1) {
      return history.length - 1;
    }
    return Math.max(0, currentIndex - 1);
  }

  if (currentIndex === -1) {
    return -1;
  }

  return currentIndex + 1 >= history.length ? -1 : currentIndex + 1;
};

export const readHistoryEntry = (
  history: readonly string[],
  index: number
): string => {
  if (index < 0 || index >= history.length) {
    return '';
  }

  return history[index] ?? '';
};
