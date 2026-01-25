import { METADATA_SCHEMA_VERSION, upgradeMetadata } from '../metadata.util';

describe('upgradeMetadata', () => {
  it('returns null unchanged when metadata is null', () => {
    const result = upgradeMetadata(null);
    expect(result.changed).toBe(false);
    expect(result.value).toBeNull();
  });

  it('adds schemaVersion to object metadata', () => {
    const result = upgradeMetadata({ foo: 'bar' });
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      foo: 'bar',
      schemaVersion: METADATA_SCHEMA_VERSION,
    });
  });

  it('updates older schemaVersion', () => {
    const result = upgradeMetadata({ schemaVersion: 1, foo: 'bar' }, 2);
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ schemaVersion: 2, foo: 'bar' });
  });
});
