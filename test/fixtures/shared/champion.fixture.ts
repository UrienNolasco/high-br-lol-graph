export function aChampion(overrides?: Record<string, unknown>) {
  return {
    name: 'Annie',
    id: 'Annie',
    key: 1,
    title: 'the Dark Child',
    version: '15.1.1',
    images: { square: 'https://example.com/square.png', loading: 'https://example.com/loading.png', splash: 'https://example.com/splash.png' },
    ...overrides,
  };
}

export function championListItem(overrides?: Record<string, unknown>) {
  return aChampion(overrides);
}
