import { describe, expect, it } from "vitest";

import {
  buildRecognitionFileUploadInput,
  canRerunRecognitionSubmit,
  createSyntheticRecognitionFile,
  describeRecognitionAsyncProgress,
  getRecognitionAsyncRecoveryHint,
  getRecognitionCapabilitySummary,
  getRecognitionProviderGate,
  getVisibleRecognitionProviderOptions,
  isRecognitionPollingStatus,
  isRecognitionSuccessfulTerminalStatus,
  LOCAL_PADDLE_OCR_PROVIDER_KEY,
  parseProviderOptions,
  parseSchemaOptions,
  validateRecognitionFile
} from "./NewRecognitionPage";

describe("NewRecognitionPage option parsing", () => {
  it("归一化异步识别任务 queued/running/completed/failed 状态供页面轮询和提示", () => {
    expect(
      describeRecognitionAsyncProgress({
        id: "job-queued",
        status: "queued",
        executionMode: "asynchronous",
        statusUrl: "/jobs/job-queued",
        resultUrl: "/results/job-queued"
      })
    ).toEqual({
      jobId: "job-queued",
      status: "queued",
      phase: "queued",
      label: "排队中",
      percent: 25,
      message: "任务已进入后台队列，正在等待识别 worker 接收。",
      recoveryAction: "可取消当前轮询或稍后重跑上一次配置。",
      statusUrl: "/jobs/job-queued",
      resultUrl: "/results/job-queued",
      shouldPoll: true,
      canOpenResult: false
    });

    expect(
      describeRecognitionAsyncProgress({
        id: "job-running",
        status: "running",
        executionMode: "asynchronous"
      })
    ).toEqual(
      expect.objectContaining({
        phase: "running",
        label: "识别中",
        percent: 65,
        shouldPoll: true,
        canOpenResult: false
      })
    );

    expect(
      describeRecognitionAsyncProgress({
        id: "job-completed",
        status: "completed",
        executionMode: "asynchronous",
        resultUrl: "/results/job-completed"
      }, true)
    ).toEqual(
      expect.objectContaining({
        phase: "completed",
        label: "结果已就绪",
        percent: 100,
        shouldPoll: false,
        canOpenResult: true,
        resultLoaded: true
      })
    );

    expect(
      describeRecognitionAsyncProgress({
        id: "job-failed",
        status: "failed",
        errorMessage: "OCR provider unavailable"
      })
    ).toEqual(
      expect.objectContaining({
        phase: "failed",
        label: "识别失败",
        percent: 100,
        shouldPoll: false,
        canOpenResult: false,
        errorMessage: "OCR provider unavailable"
      })
    );
  });

  it("识别轮询状态和 terminal 状态判断兼容后端扩展状态", () => {
    expect(isRecognitionPollingStatus("queued")).toBe(true);
    expect(isRecognitionPollingStatus("running")).toBe(true);
    expect(isRecognitionPollingStatus("completed")).toBe(false);

    expect(isRecognitionSuccessfulTerminalStatus("completed")).toBe(true);
    expect(isRecognitionSuccessfulTerminalStatus("needs_review")).toBe(true);
    expect(isRecognitionSuccessfulTerminalStatus("partial_completed")).toBe(true);
    expect(isRecognitionSuccessfulTerminalStatus("writeback_completed")).toBe(true);
    expect(isRecognitionSuccessfulTerminalStatus("failed")).toBe(false);
  });

  it("识别排队/处理中状态展示队列积压、worker 和失败恢复提示", () => {
    const queuedProgress = describeRecognitionAsyncProgress({
      id: "job-backlog",
      status: "queued",
      statusUrl: "/jobs/job-backlog",
      resultUrl: "/results/job-backlog",
      statusSemantics: {
        queuePosition: 7,
        queueDepth: 12,
        retryAfterSeconds: 30
      }
    });

    expect(queuedProgress).toEqual(
      expect.objectContaining({
        phase: "queued",
        queueSummary: "排队第 7 位，队列待处理 12 个任务。",
        retrySummary: "建议 30 秒后重试状态读取。",
        recoveryAction: "可取消当前轮询或稍后重跑上一次配置。"
      })
    );
    expect(getRecognitionAsyncRecoveryHint(queuedProgress)).toEqual({
      tone: "info",
      primaryAction: "继续轮询",
      secondaryAction: "取消轮询"
    });

    const runningProgress = describeRecognitionAsyncProgress({
      id: "job-running",
      status: "running",
      statusSemantics: {
        workerId: "worker-a",
        attempt: 2,
        heartbeatAgeSeconds: 14
      }
    });

    expect(runningProgress).toEqual(
      expect.objectContaining({
        phase: "running",
        workerSummary: "worker-a 正在处理，第 2 次尝试，心跳 14 秒前。",
        recoveryAction: "如长时间无心跳，可取消当前轮询并重跑上一次配置。"
      })
    );

    const failedProgress = describeRecognitionAsyncProgress({
      id: "job-failed",
      status: "failed",
      errorMessage: "OCR_TIMEOUT"
    });

    expect(getRecognitionAsyncRecoveryHint(failedProgress)).toEqual({
      tone: "warning",
      primaryAction: "重跑上次配置",
      secondaryAction: "检查 Provider 健康状态"
    });
  });

  it("把真实 Schema API 响应转换成 value=backend key 的下拉选项", () => {
    const options = parseSchemaOptions({
      items: [
        {
          schemaKey: "lims-clinical-info",
          displayName: "LIMS 临床信息弹窗字段",
          version: 2
        }
      ]
    });

    expect(options).toEqual([
      {
        value: "lims-clinical-info",
        label: "LIMS 临床信息弹窗字段 v2"
      }
    ]);
  });

  it("按 kind 过滤 Provider API 响应，并把 mock provider 排除出识别主路径", () => {
    const response = {
      items: [
        { key: "mock-ocr", kind: "ocr", name: "Mock OCR Provider", isMock: true },
        { key: "mock-model", kind: "llm", name: "Mock Model Provider", isMock: true },
        { key: "http-ocr", kind: "ocr", name: "HTTP OCR Provider", isMock: false },
        { key: "openai-responses-model", kind: "llm", name: "OpenAI Responses Provider", isMock: false },
        { key: "local-storage", kind: "storage", name: "Local Storage Provider" }
      ]
    };

    expect(parseProviderOptions(response, "ocr")).toEqual([
      {
        value: "http-ocr",
        label: "HTTP OCR Provider"
      }
    ]);
    expect(parseProviderOptions(response, "llm")).toEqual([
      {
        value: "openai-responses-model",
        label: "OpenAI Responses Provider"
      }
    ]);
  });

  it("新建识别只要求模型提供商，本地 PaddleOCR 和内置存储不再要求用户配置 Provider", () => {
    const response = {
      items: [
        { key: "mock-ocr", kind: "ocr", name: "Mock OCR Provider", isMock: true },
        { key: "mock-model", kind: "llm", name: "Mock Model Provider", isMock: true }
      ]
    };
    const llmProviders = parseProviderOptions(response, "llm");

    expect(getVisibleRecognitionProviderOptions(response, "ocr").mockOnly).toBe(true);
    expect(getRecognitionProviderGate(llmProviders)).toEqual({
      canCreate: false,
      message: "请先配置模型提供商；本地 PaddleOCR 和内置文件保存已作为项目内置能力。"
    });

    expect(
      getRecognitionProviderGate([
        {
          value: "openai-compatible-model",
          label: "OpenAI-compatible Provider"
        }
      ])
    ).toEqual({
      canCreate: true,
      message: "本地 PaddleOCR、内置文件保存和模型提供商均已就绪。"
    });
  });

  it("能力摘要把 OCR 和 Storage 显示成内置能力，只把 LLM 显示成待配置或已连接", () => {
    expect(getRecognitionCapabilitySummary([])).toEqual([
      {
        key: "ocr",
        label: "本地 OCR",
        value: "PaddleOCR",
        status: "ready",
        description: "本项目固定使用本机 PaddleOCR，不需要录入 OCR Endpoint。"
      },
      {
        key: "storage",
        label: "文件保存",
        value: "内置本地存储",
        status: "ready",
        description: "识别文件和中间结果先写入项目内置保存策略。"
      },
      {
        key: "llm",
        label: "模型提供商",
        value: "待配置",
        status: "blocked",
        description: "请先在识别能力检查中配置一个可用模型。"
      }
    ]);

    expect(
      getRecognitionCapabilitySummary([
        {
          value: "deepseek-chat",
          label: "DeepSeek Chat"
        }
      ])[2]
    ).toEqual({
      key: "llm",
      label: "模型提供商",
      value: "DeepSeek Chat",
      status: "ready",
      description: "结构化抽取会使用当前选中的模型提供商。"
    });
  });

  it("合成样本也创建真实 Blob/File 内容，避免只创建无字节文件记录", async () => {
    const file = createSyntheticRecognitionFile();

    expect(file.name).toBe("synthetic-clinical-record.pdf");
    expect(file.type).toBe("application/pdf");
    await expect(file.text()).resolves.toContain("synthetic clinical record");
  });

  it("上传病历文件时使用真实 SHA-256 checksum 和 base64 字节", async () => {
    const file = new File(["DEMO_PDF_BYTES"], "record.pdf", {
      type: "application/pdf"
    });

    await expect(
      buildRecognitionFileUploadInput({
        file,
        adapter: "lims-clinical-payload",
        ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
        provider: "openai-responses-model",
        privacy: {
          deidentify: true,
          keepEvidence: true,
          allowWriteBack: false
        }
      })
    ).resolves.toEqual({
      originalName: "record.pdf",
      mimeType: "application/pdf",
      byteSize: 14,
      checksumSha256: "b66f1b66ec824925d01f389a3494722c0676af4d131cc3bd7d38b7c06bf62d61",
      contentBase64: "REVNT19QREZfQllURVM=",
      metadata: {
        adapter: "lims-clinical-payload",
        ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
        provider: "openai-responses-model",
        privacy: {
          deidentify: true,
          keepEvidence: true,
          allowWriteBack: false
        },
        source: "demo-web"
      }
    });
  });

  it("本地 base64/SHA-256 装配在识别创建取消时抛出 AbortError，避免继续上传", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      buildRecognitionFileUploadInput({
        file: new File(["DEMO_PDF_BYTES"], "record.pdf", {
          type: "application/pdf"
        }),
        adapter: "lims-clinical-payload",
        ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
        provider: "openai-responses-model",
        privacy: {
          deidentify: true,
          keepEvidence: true,
          allowWriteBack: false
        },
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  it("取消后保留上一次识别配置，非 loading 状态允许重跑", () => {
    const file = new File(["DEMO_PDF_BYTES"], "record.pdf", {
      type: "application/pdf"
    });
    const lastSubmit = {
      file,
      schemaName: "lims-clinical-info",
      adapter: "OutpatientPdfAdapter" as const,
      ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
      provider: "openai-responses-model",
      privacy: {
        deidentify: true,
        keepEvidence: true,
        allowWriteBack: false
      }
    };

    expect(canRerunRecognitionSubmit(lastSubmit, { status: "cancelled", message: "识别任务创建已取消，可重跑上一次配置。" })).toBe(true);
    expect(canRerunRecognitionSubmit(lastSubmit, { status: "loading" })).toBe(false);
    expect(
      canRerunRecognitionSubmit(lastSubmit, {
        status: "success",
        jobId: "job-queued",
        progress: describeRecognitionAsyncProgress({
          id: "job-queued",
          status: "queued"
        })
      })
    ).toBe(false);
    expect(canRerunRecognitionSubmit(null, { status: "cancelled", message: "识别任务创建已取消，可重跑上一次配置。" })).toBe(false);
  });

  it("在创建识别任务前拦截空文件、超大文件和非病历文件类型", () => {
    expect(
      validateRecognitionFile({
        name: "record.pdf",
        size: 1024,
        type: "application/pdf"
      })
    ).toEqual({ valid: true });

    expect(
      validateRecognitionFile({
        name: "empty.pdf",
        size: 0,
        type: "application/pdf"
      })
    ).toEqual({ valid: false, message: "病历文件内容为空，请重新选择文件。" });

    expect(
      validateRecognitionFile({
        name: "large-record.pdf",
        size: 20 * 1024 * 1024 + 1,
        type: "application/pdf"
      })
    ).toEqual({ valid: false, message: "单个病历文件不能超过 20MB。" });

    expect(
      validateRecognitionFile({
        name: "record.txt",
        size: 1024,
        type: "text/plain"
      })
    ).toEqual({ valid: false, message: "仅支持 PNG、JPG 或 PDF 病历文件。" });
  });
});
