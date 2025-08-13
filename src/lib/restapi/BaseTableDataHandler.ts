import {BaseHandler} from "./BaseHandler";

// @Todo: the whole class needs to be refactored to use Kysely instead and the new AbstractTable
export abstract class BaseTableDataHandler<E extends IJSONContent> extends BaseHandler<E[]> {

    abstract getTable(): Promise<AJSONTable<E>>;

    async patch(body: any): Promise<void> {
        const table = await this.getTable();

        if (Object.keys(body).length === 2 && body.id !== undefined && body.priority !== undefined) {
            await table.updatePriority(body.id, body.priority);
        } else {
            await table.updateOne(body);
        }

        await this.postProcess(await this.db);
        const result = await table.selectById(body.id!);
        if (result) {
            this.ok([result]);
        } else {
            this.error(ErrorCode.NOT_FOUND);
        }
    }

    async get(params: Record<string, string>): Promise<void> {
        let result: E[];
        const table = await this.getTable();
        if (params['id'] !== undefined) {
            const id = assertValidNumber(params['id']);
            result = [await table.selectById(id)]
        } else if (params['parentId'] !== undefined) {
            const parentId = assertValidNumber(params['parentId']);
            result = await table.selectAllByParentId(parentId);
        } else {
            result = await table.selectAll();
        }

        this.ok(await this.postGet(result));
    }

    async post(body: any): Promise<void> {
        const table = await this.getTable();
        const id = await table.insertOne(body);
        await this.postProcess(await this.db);
        const result = await table.selectById(id);
        if (result) {
            this.ok([result]);
        } else {
            this.error(ErrorCode.NOT_FOUND, 'Rule not found after insert');
        }
    }

    async delete(body: any): Promise<void> {
        const table = await this.getTable();
        const result = await table.selectById(assertValidId(body.id));
        if (result) {
            await table.deleteById(body.id);
            await this.postProcess(await this.db);
            this.ok([result]);
        } else {
            this.error(ErrorCode.NOT_FOUND);
        }
    }

    protected async postProcess(db: DatabaseService): Promise<void> {
        // not implemented
    }

    protected async postGet(result: E[]): Promise<E[]> {
        return result;
    }
}