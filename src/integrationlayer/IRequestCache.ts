import {CacheEntry, TTL} from '@datalayer/AbstractCacheRepository';

export default interface IRequestCache {
    /**
     * Retrieve last cached value matching select criteria. Returns null when not found or expired.
     */
    getLast<T>(select: Partial<CacheEntry<T>>, ttl?: TTL): Promise<T | null>;

    /**
     * Persist the value under the provided cache key.
     */
    save<T>(record: {key: string; type: string; [key: string]: any}, content: T): Promise<boolean>;
}
