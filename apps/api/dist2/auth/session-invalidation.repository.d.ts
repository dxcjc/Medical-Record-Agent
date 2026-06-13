import type { SessionInvalidationRepository, SessionInvalidationStoreBlockedReason, SessionInvalidationStoreProvider } from "./auth.service";
export interface SessionInvalidationRepositoryDescription {
    provider: SessionInvalidationStoreProvider;
    storage: string;
    productionReady: false;
    blockedReason: Extract<SessionInvalidationStoreBlockedReason, "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN">;
    redaction: {
        rawTokenPersisted: false;
        tokenHashOnly: true;
    };
    capabilities: {
        centralized: true;
        durable: true;
        ttl: true;
    };
    readiness: {
        nextAction: string;
        requiredChecks: string[];
    };
}
export interface SessionInvalidationRepositoryAdapter extends SessionInvalidationRepository {
    describe(): SessionInvalidationRepositoryDescription;
}
export interface DatabaseSessionInvalidationDelegate {
    upsert(input: {
        where: {
            tokenHash: string;
        };
        create: {
            tokenHash: string;
            invalidatedAt: Date;
            expiresAt: Date;
        };
        update: {
            invalidatedAt: Date;
            expiresAt: Date;
        };
    }): Promise<unknown>;
    findFirst(input: {
        where: {
            tokenHash: string;
            expiresAt: {
                gt: Date;
            };
        };
    }): Promise<unknown | null>;
}
export interface RedisSessionInvalidationClient {
    set(key: string, value: string, options: {
        px: number;
    }): Promise<unknown>;
    get(key: string): Promise<string | null>;
}
export declare function createDatabaseSessionInvalidationRepository(options: {
    delegate: DatabaseSessionInvalidationDelegate;
    storageName?: string;
}): SessionInvalidationRepositoryAdapter;
export declare function createRedisSessionInvalidationRepository(options: {
    client: RedisSessionInvalidationClient;
    keyPrefix?: string;
}): SessionInvalidationRepositoryAdapter;
//# sourceMappingURL=session-invalidation.repository.d.ts.map