export function patch(version: string) {
  return {
    asDto() {
      return {
        patch: version,
        fullVersion: `${version}.1`,
      };
    },
    asCurrent(versionOverride?: string) {
      const v = versionOverride ?? version;
      return {
        patches: [
          { patch: v, fullVersion: `${v}.1` },
          { patch: '15.1', fullVersion: '15.1.2' },
        ],
        current: { patch: v, fullVersion: `${v}.1` },
      };
    },
  };
}
