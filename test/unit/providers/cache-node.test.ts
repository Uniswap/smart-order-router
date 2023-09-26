import NodeCache from 'node-cache';
import { NodeJSCache } from '../../../src';

describe('NodeJSCache', () => {
  const underlyingCache = new NodeCache()
  const cache = new NodeJSCache<string>(underlyingCache)

  it('set keys and batchGet', async () => {
    await Promise.all([
      cache.set('key1', 'value1'),
      cache.set('key2', 'value2')
    ]);

    const batchGet = await cache.batchGet(new Set(['key1', 'key2', 'key3']));
    expect(batchGet['key1']).toEqual('value1');
    expect(batchGet['key2']).toEqual('value2');
    expect(batchGet['key3']).toBeUndefined();
  });

  it('set keys with ttl', async () => {
    const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

    await Promise.all([
      cache.set('key1', 'value1', 600),
      cache.set('key2', 'value2', 10)
    ]);

    // rounded milliseconds to seconds, so that the flaky test failure due to millisecond difference is avoided
    expect(Math.floor((underlyingCache.getTtl('key1') ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + 600);
    expect(Math.floor((underlyingCache.getTtl('key2') ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + 10);
  })
});
