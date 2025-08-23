export default interface IRequestCache {
    /**
     * Retrieve cached value for the key. Returns null when not found.
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Store value under the key.
     */
    set<T>(key: string, value: T): Promise<void>;
}
