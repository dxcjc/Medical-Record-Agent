import { buildProductionSessionInvalidationStoreContract, buildSecretResolverContract, createProductionApiServices } from "./bootstrap/production-services";
import { loadEnv } from "./config/env";
import { createApiServer } from "./server";
const env = loadEnv();
const port = env.server.port;
const host = env.server.host ?? "0.0.0.0";
const server = await createApiServer({
    services: createProductionApiServices({ env }),
    runtimeInfo: {
        serviceMode: "production",
        providers: {
            ocr: env.providers.ocr.provider,
            llm: env.providers.llm.provider,
            storage: env.storage.driver,
            writeback: "lims"
        },
        secretResolver: buildSecretResolverContract(process.env),
        sessionInvalidationStore: buildProductionSessionInvalidationStoreContract(process.env)
    },
    logger: true
});
try {
    await server.listen({ port, host });
}
catch (error) {
    server.log.error(error);
    process.exitCode = 1;
}
//# sourceMappingURL=index.js.map