export default interface IRequestCache {
    /**
     * Retrieve cached value for the url. Returns null when not found.
     */
    get<T>(url: string): Promise<T | null>;

    /**
     * Store value under the key.
     */
    set<T>(url: string, value: T): Promise<void>;
}
