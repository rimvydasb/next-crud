import type {NextApiRequest, NextApiResponse} from 'next'

export function createMock(method: string, body: any = {}, query: any = {}) {
    const req = {method, body, query} as unknown as NextApiRequest
    const res: any = {
        statusCode: 0,
        data: undefined as any,
        status(code: number) {
            this.statusCode = code
            return this
        },
        json(payload: any) {
            this.data = payload
            return this
        },
        end() {
            return this
        },
        setHeader() {
            // no-op for tests
        },
        statusMessage: '',
    }
    return {req, res: res as NextApiResponse}
}
