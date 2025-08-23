export default interface ITokenStore {
    /**
     * Retrieve a valid access token.
     */
    getToken(): Promise<string>;

    /**
     * Force refresh the access token.
     */
    refreshToken(): Promise<string>;
}
