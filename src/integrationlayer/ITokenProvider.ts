/** Data returned from token provider. */
export interface TokenData {
    token: string;
    /** When omitted the token is treated as non-expiring. */
    expiryDate?: number;
    refreshToken?: string;
    refreshTokenExpiryDate?: number;
}

export default interface ITokenProvider {
    /** Obtain a completely new access token. */
    fetchNewToken(): Promise<TokenData>;
    /** Refresh the token using the provided refresh token. */
    refreshExistingToken?(refreshToken: string): Promise<TokenData>;
}
