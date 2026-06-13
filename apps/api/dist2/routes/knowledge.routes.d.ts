import type { FastifyInstance } from "fastify";
export interface KnowledgeRouteService {
    knowledgeRepository: {
        list(filter: any): Promise<any[]>;
        getById(id: string): Promise<any>;
        create(input: any): Promise<any>;
        update(id: string, input: any): Promise<any>;
        delete(id: string): Promise<void>;
        count(): Promise<number>;
    };
}
export declare function registerKnowledgeRoutes(app: FastifyInstance, service: KnowledgeRouteService, authHook?: any): void;
//# sourceMappingURL=knowledge.routes.d.ts.map