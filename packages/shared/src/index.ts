// 共享包入口统一导出跨包类型和合成演示 fixtures。
// 这里不放运行时业务逻辑，避免 shared 包依赖外部服务或具体应用实现。
export * from "./types";
export * from "./fixtures";
