import DatabaseTokenStore from '@integrationlayer/DatabaseTokenStore';
import ITokenProvider, {TokenData} from '@integrationlayer/ITokenProvider';

class MemoryRepository {
    private store = new Map<string, any>();
    async getValue(key: string): Promise<TokenData | null> {
        return this.store.get(key) ?? null;
    }
    async setValue(key: string, value: TokenData): Promise<void> {
        this.store.set(key, value)
    }
}

describe('DatabaseTokenStore', () => {
    test('retrieves and refreshes tokens', async () => {
        const repo = new MemoryRepository();
        const provider: ITokenProvider = {
            fetchNewToken: jest.fn().mockResolvedValue({
                token: 'token1',
                expiryDate: Date.now() + 1000,
                refreshToken: 'refresh1',
                refreshTokenExpiryDate: Date.now() + 2000,
            }),
            refreshExistingToken: jest.fn().mockResolvedValue({
                token: 'token2',
                expiryDate: Date.now() + 1000,
                refreshToken: 'refresh1',
                refreshTokenExpiryDate: Date.now() + 2000,
            }),
        };

        const store = new DatabaseTokenStore(repo as any, 'key', provider);
        const token1 = await store.getToken();
        expect(token1).toBe('token1');
        expect((provider.fetchNewToken as jest.Mock)).toHaveBeenCalledTimes(1);

        // expire token and ensure refresh is called
        await repo.setValue('key', {
            token: 'token1',
            expiryDate: Date.now() - 1000,
            refreshToken: 'refresh1',
            refreshTokenExpiryDate: Date.now() + 2000,
        });
        const token2 = await store.getToken();
        expect(token2).toBe('token2');
        expect((provider.refreshExistingToken as jest.Mock)).toHaveBeenCalledTimes(1);
    });
});
