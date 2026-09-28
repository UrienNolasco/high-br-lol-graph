import { storedOnlyRawMatchSource } from './offline-processing';

describe('offline processing source', () => {
  it('fails explicitly if an offline flow tries to fetch externally', async () => {
    const source = storedOnlyRawMatchSource();

    await expect(source.getMatchById('BR1_1')).rejects.toThrow(
      'Offline processing attempted external match fetch',
    );
    await expect(source.getTimeline('BR1_1')).rejects.toThrow(
      'Offline processing attempted external timeline fetch',
    );
  });
});
