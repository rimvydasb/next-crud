import type {NextApiRequest, NextApiResponse} from 'next';
import {ParsedUrlQuery} from 'querystring'
import {Kysely} from "kysely";
import {DatabaseSchema} from "../entities";
import {DatabaseService} from "../DatabaseService";

export enum ErrorCode {
    NOT_FOUND = 404,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    INTERNAL_SERVER_ERROR = 500,
    METHOD_NOT_ALLOWED = 405,
}

export class ResponseError extends Error {
    public status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export abstract class BaseHandler<T> {

    protected response: NextApiResponse;
    protected request: NextApiRequest;

    constructor(req: NextApiRequest,
                res: NextApiResponse<T | { message: string }>) {
        this.request = req;
        this.response = res;
    }

    private normalizeQuery(q: ParsedUrlQuery): Record<string, string> {
        const out: Record<string, string> = {}
        for (const key in q) {
            const v = q[key]
            out[key] = Array.isArray(v) ? v[0] : (v ?? '')
        }
        return out
    }

    protected get db(): Promise<Kysely<DatabaseSchema>> {
        // Delegate to DatabaseService singleton
        return DatabaseService.getInstance();
    }

    protected error(code: ErrorCode, message?: string): void {
        if (message === undefined) {
            switch (code) {
                case ErrorCode.NOT_FOUND:
                    message = 'Not Found';
                    break;
                case ErrorCode.BAD_REQUEST:
                    message = 'Bad Request';
                    break;
                case ErrorCode.UNAUTHORIZED:
                    message = 'Unauthorized';
                    break;
                case ErrorCode.FORBIDDEN:
                    message = 'Forbidden';
                    break;
                case ErrorCode.INTERNAL_SERVER_ERROR:
                    message = 'Internal Server Error';
                    break;
                case ErrorCode.METHOD_NOT_ALLOWED:
                    message = `Method ${this.request.method} Not Allowed`;
                    break;
                default:
                    message = `Unknown Error for ${code}`;
            }
        }

        console.error(`Server Error in ${this.request.method}`, message);
        this.response.statusMessage = message.replace(/[^\x20-\x7E]/g, ' ');
        this.response.status(code).end();
    }

    protected ok(data: T): void {
        this.response.status(200).json(data);
    }

    public async handle(): Promise<void> {
        try {
            switch (this.request.method) {
                case 'GET':
                    await this.get(this.normalizeQuery(this.request.query))
                    break;
                case 'POST':
                    await this.post(this.request.body);
                    break;
                case 'PUT':
                    await this.put(this.request.body);
                    break;
                case 'PATCH':
                    await this.patch(this.request.body);
                    break;
                case 'DELETE':
                    await this.delete(this.request.body);
                    break;
                default:
                    this.error(ErrorCode.METHOD_NOT_ALLOWED);
            }
        } catch (error: any) {
            console.error(`Error in ${this.request.method}`, error);
            let message = error.message || error.code || 'Unknown Error';
            if (typeof error === 'string') {
                message = error;
            }
            this.error(error.status || ErrorCode.INTERNAL_SERVER_ERROR, message);
        }
    }

    protected async get(params: Record<string, string>) {
        this.error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    protected async post(body: any) {
        this.error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    protected async put(body: any) {
        this.error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    protected async patch(body: any) {
        this.error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    protected async delete(body: any) {
        this.error(ErrorCode.METHOD_NOT_ALLOWED);
    }
}
