import { createDemoApiServices } from "./demo-services";
import {
  buildProductionSessionInvalidationStoreContract,
  buildSecretResolverContract,
  createProductionApiServices
} from "./bootstrap/production-services";
import { loadEnv } from "./config/env";
import { createApiServer } from "./server";

const serviceMode = process.env.API_SERVICE_MODE ?? "demo";
const env = serviceMode === "production" ? loadEnv() : null;
const port = env?.server.port ?? Number.parseInt(process.env.PORT ?? "3000", 10);
const host = env?.server.host ?? process.env.HOST ?? "0.0.0.0";
const server = await createApiServer({
  services: serviceMode === "production" && env ? createProductionApiServices({ env }) : createDemoApiServices(),
  runtimeInfo: {
    serviceMode,
    providers:
      serviceMode === "production" && env
        ? {
            ocr: env.providers.ocr.provider,
            llm: env.providers.llm.provider,
            storage: env.storage.driver,
            writeback: "lims"
          }
        : {
            ocr: "mock",
            llm: "mock",
            storage: "memory",
            writeback: "demo"
          },
    ...(serviceMode === "production"
      ? {
          secretResolver: buildSecretResolverContract(process.env),
          sessionInvalidationStore: buildProductionSessionInvalidationStoreContract(process.env)
        }
      : {})
  },
  logger: true
});

try {
  await server.listen({ port, host });
} catch (error) {
  // 启动失败时记录错误并设置退出码，避免开发环境静默失败。
  server.log.error(error);
  process.exitCode = 1;
}
