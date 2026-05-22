export const toggleAppSelection = (selectedIds: readonly string[], appId: string): string[] => {
  const normalizedAppId = appId.trim();
  if (!normalizedAppId) {
    return [...selectedIds];
  }

  if (selectedIds.includes(normalizedAppId)) {
    return selectedIds.filter((id) => id !== normalizedAppId);
  }

  return [...selectedIds, normalizedAppId];
};

export const normalizeSelection = (selectedIds: readonly string[]): string[] =>
  Array.from(new Set(selectedIds.map((id) => id.trim()).filter(Boolean)));
