import NodeCache from 'node-cache';
import { ICache } from './cache';
export declare class NodeJSCache<T> implements ICache<T> {
    private nodeCache;
    constructor(nodeCache: NodeCache);
    get(key: string): Promise<T | undefined>;
    batchGet(keys: Set<string>): Promise<Record<string, T | undefined>>;
    set(key: string, value: T, ttl?: number): Promise<boolean>;
    has(key: string): Promise<boolean>;
}
