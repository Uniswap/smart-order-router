import NodeCache from 'node-cache';
import { NodeJSCache } from '../../../build/main';

describe('NodeJSCache', () => {
  const cache = new NodeJSCache<string>(new NodeCache())

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
});
