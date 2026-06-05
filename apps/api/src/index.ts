import { createDemoApiServices } from "./demo-services";
import { createApiServer } from "./server";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const server = await createApiServer({
  services: createDemoApiServices(),
  logger: true
});

try {
  await server.listen({ port, host });
} catch (error) {
  // 启动失败时记录错误并设置退出码，避免开发环境静默失败。
  server.log.error(error);
  process.exitCode = 1;
}
