import {AbstractKeyValueRepository} from '@datalayer/AbstractKeyValueRepository';
import ITokenStore from './ITokenStore';
import ITokenProvider, {TokenData} from './ITokenProvider';

/**
 * Persists access tokens in a key–value repository and refreshes them
 * using the supplied {@link ITokenProvider}.
 */
export default class DatabaseTokenStore implements ITokenStore {
    private readonly repository: AbstractKeyValueRepository<any, any>;
    private readonly key: string;
    private readonly provider: ITokenProvider;

    constructor(
        repository: AbstractKeyValueRepository<any, any>,
        key: string,
        provider: ITokenProvider,
    ) {
        this.repository = repository;
        this.key = key;
        this.provider = provider;
    }

    /** Retrieve a valid token from storage, refreshing when necessary. */
    async getToken(): Promise<string> {
        const existing = (await this.repository.getValue(this.key)) as TokenData | null | undefined;
        if (existing && (!existing.expiryDate || existing.expiryDate > Date.now())) {
            return existing.token;
        }
        return this.refreshTokenInternal(existing ?? undefined);
    }

    /** Force a refresh of the token regardless of its expiry. */
    async refreshToken(): Promise<string> {
        const existing = (await this.repository.getValue(this.key)) as TokenData | null | undefined;
        return this.refreshTokenInternal(existing ?? undefined);
    }

    /** Persist a freshly fetched token and return its value. */
    private async refreshTokenInternal(existing?: TokenData): Promise<string> {
        let data: TokenData;
        if (
            existing &&
            existing.refreshToken &&
            (!existing.refreshTokenExpiryDate || existing.refreshTokenExpiryDate > Date.now()) &&
            this.provider.refreshExistingToken
        ) {
            data = await this.provider.refreshExistingToken(existing.refreshToken);
        } else {
            data = await this.provider.fetchNewToken();
        }
        if (!data.token) {
            throw new Error('Token provider returned empty token');
        }
        await this.repository.setValue(this.key, data);
        return data.token;
    }
}
