/**
 * OpenAPI 3.1.0 规范文档
 * 访问地址: /docs
 */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Medical Record Agent API",
    version: "0.1.0",
    description: "病历识别 Agent 后端 API — 管理识别任务、Schema、Provider、评测、反馈和回写。"
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer" as const,
        description: "JWT Bearer token（通过 /auth/login 获取）"
      },
      apiToken: {
        type: "apiKey" as const,
        in: "header" as const,
        name: "x-api-token",
        description: "API 长期令牌（用于 CI/脚本集成）"
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object" as const,
        required: ["error"],
        properties: {
          error: { type: "string" as const, description: "错误码" }
        }
      },
      FileUploadRequest: {
        type: "object" as const,
        required: ["originalName", "mimeType", "byteSize", "contentBase64"],
        properties: {
          originalName: { type: "string" as const },
          mimeType: { type: "string" as const },
          byteSize: { type: "integer" as const, minimum: 1 },
          checksumSha256: { type: "string" as const, description: "SHA-256 校验和" },
          contentBase64: { type: "string" as const, contentEncoding: "base64" as const }
        }
      },
      RecognitionJob: {
        type: "object" as const,
        required: ["id", "status", "schemaKey"],
        properties: {
          id: { type: "string" as const },
          status: {
            type: "string" as const,
            enum: ["queued", "running", "completed", "partial_completed", "needs_review", "writeback_pending", "writeback_completed", "writeback_failed", "failed"]
          },
          schemaKey: { type: "string" as const },
          sourceFileId: { type: ["string" as const, "null" as const] }
        }
      },
      ProviderConfigRequest: {
        type: "object" as const,
        required: ["kind", "displayName", "enabled", "isDefault", "config", "secretRefs"],
        properties: {
          kind: { type: "string" as const, enum: ["ocr", "llm", "storage", "lims"] },
          displayName: { type: "string" as const },
          enabled: { type: "boolean" as const },
          isDefault: { type: "boolean" as const },
          config: { type: "object" as const, description: "Provider 配置参数" },
          secretRefs: { type: "object" as const, additionalProperties: { type: "string" as const }, description: "密钥引用映射" }
        }
      },
      WritebackRequest: {
        type: "object" as const,
        required: ["jobId", "confirmed"],
        properties: {
          jobId: { type: "string" as const },
          confirmed: { type: "boolean" as const, const: true },
          payload: { type: "object" as const },
          idempotencyKey: { type: "string" as const, description: "幂等键" }
        }
      },
      FeedbackRequest: {
        type: "object" as const,
        required: ["jobId", "fieldKey", "correctedValue"],
        properties: {
          jobId: { type: "string" as const },
          schemaVersionId: { type: "string" as const },
          fieldKey: { type: "string" as const },
          originalValue: { description: "原始值" },
          correctedValue: { description: "修正值" },
          comment: { type: "string" as const }
        }
      },
      KnowledgeEntry: {
        type: "object" as const,
        required: ["kind", "title", "content"],
        properties: {
          kind: { type: "string" as const, enum: ["medical_term", "cancer_alias", "lims_dictionary", "field_description"] },
          title: { type: "string" as const },
          content: { type: "string" as const },
          keywords: { type: "array" as const, items: { type: "string" as const } },
          fieldKeys: { type: "array" as const, items: { type: "string" as const } },
          enabled: { type: "boolean" as const }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }, { apiToken: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "服务健康检查",
        security: [] as const,
        responses: {
          "200": { description: "服务正常", content: { "application/json": { schema: { type: "object" as const, properties: { status: { type: "string" as const }, service: { type: "string" as const } } } } } }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "用户登录",
        description: "使用邮箱密码登录，返回 JWT token。同 IP 20次/分钟限流。",
        security: [] as const,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" as const, required: ["email", "password"], properties: { email: { type: "string" as const }, password: { type: "string" as const } } } } }
        },
        responses: {
          "200": { description: "登录成功，返回 accessToken 和 user 信息" },
          "400": { description: "参数错误", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "429": { description: "登录限流" }
        }
      }
    },
    "/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "获取识别任务列表",
        description: "分页查询识别任务，支持按状态/schemaKey/关键词过滤。",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" as const } },
          { name: "pageSize", in: "query", schema: { type: "integer" as const } },
          { name: "status", in: "query", schema: { type: "string" as const } },
          { name: "schemaKey", in: "query", schema: { type: "string" as const } },
          { name: "search", in: "query", schema: { type: "string" as const } }
        ],
        responses: {
          "200": { description: "任务列表（分页）" }
        }
      },
      post: {
        tags: ["Jobs"],
        summary: "创建识别任务",
        description: "提交新的病历识别任务。需指定 schemaKey 和 sourceFileId。",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["schemaKey"],
                properties: {
                  schemaKey: { type: "string" as const },
                  sourceFileId: { type: "string" as const },
                  schemaVersionId: { type: "string" as const },
                  providerConfig: { type: "object" as const, description: "自定义 Provider 配置覆盖" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "任务已创建并排队", content: { "application/json": { schema: { $ref: "#/components/schemas/RecognitionJob" } } } }
        }
      }
    },
    "/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "获取任务详情",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "任务详情（含 trace、result）" },
          "404": { description: "任务不存在" }
        }
      }
    },
    "/results/{jobId}": {
      get: {
        tags: ["Results"],
        summary: "获取识别结果",
        description: "返回指定任务的字段抽取结果、证据链和 payload。",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "识别结果" },
          "404": { description: "结果不存在" }
        }
      }
    },
    "/feedback": {
      post: {
        tags: ["Feedback"],
        summary: "提交字段反馈",
        description: "对识别结果中某个字段提交人工修正反馈。",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/FeedbackRequest" } } }
        },
        responses: {
          "200": { description: "反馈已记录" }
        }
      }
    },
    "/feedback/all": {
      get: {
        tags: ["Feedback"],
        summary: "查询所有反馈",
        parameters: [
          { name: "fieldKey", in: "query", schema: { type: "string" as const } },
          { name: "jobId", in: "query", schema: { type: "string" as const } },
          { name: "page", in: "query", schema: { type: "integer" as const } },
          { name: "pageSize", in: "query", schema: { type: "integer" as const } }
        ],
        responses: { "200": { description: "反馈列表（分页）" } }
      }
    },
    "/feedback/stats": {
      get: {
        tags: ["Feedback"],
        summary: "反馈字段统计",
        responses: { "200": { description: "各字段反馈计数" } }
      }
    },
    "/providers": {
      get: {
        tags: ["Providers"],
        summary: "获取 Provider 列表",
        description: "返回所有已配置的 Provider，secretRefs 已脱敏。",
        responses: { "200": { description: "Provider 列表" } }
      }
    },
    "/providers/{key}": {
      put: {
        tags: ["Providers"],
        summary: "更新 Provider 配置",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" as const } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProviderConfigRequest" } } } },
        responses: { "200": { description: "更新后的 Provider 配置" } }
      }
    },
    "/providers/{key}/default": {
      post: {
        tags: ["Providers"],
        summary: "设为默认 Provider",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" as const } }],
        responses: { "200": { description: "已设为默认" } }
      }
    },
    "/providers/{key}/health": {
      post: {
        tags: ["Providers"],
        summary: "检查 Provider 健康状态",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" as const } }],
        responses: { "200": { description: "健康检查结果" } }
      }
    },
    "/schemas": {
      get: {
        tags: ["Schemas"],
        summary: "获取 Schema 版本列表",
        responses: { "200": { description: "所有已发布 Schema 版本" } }
      }
    },
    "/schemas/drafts": {
      get: {
        tags: ["Schemas"],
        summary: "获取 Schema 草稿列表",
        responses: { "200": { description: "所有草稿" } }
      },
      post: {
        tags: ["Schemas"],
        summary: "创建 Schema 草稿",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" as const, required: ["schemaKey", "displayName", "definition"], properties: { schemaKey: { type: "string" as const }, displayName: { type: "string" as const }, definition: { type: "object" as const } } } } }
        },
        responses: { "200": { description: "草稿已创建" } }
      }
    },
    "/evaluations/datasets": {
      get: {
        tags: ["Evaluations"],
        summary: "获取评测数据集列表",
        responses: { "200": { description: "数据集列表" } }
      },
      post: {
        tags: ["Evaluations"],
        summary: "创建评测数据集",
        responses: { "201": { description: "数据集已创建" } }
      }
    },
    "/evaluations/runs": {
      get: {
        tags: ["Evaluations"],
        summary: "获取评测运行记录",
        responses: { "200": { description: "运行记录列表" } }
      },
      post: {
        tags: ["Evaluations"],
        summary: "创建评测运行",
        responses: { "201": { description: "评测已排队" } }
      }
    },
    "/writeback": {
      post: {
        tags: ["Writeback"],
        summary: "执行回写",
        description: "将识别结果回写到 LIMS 等目标系统。同一 Job 30次/分钟限流。",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WritebackRequest" } } } },
        responses: {
          "200": { description: "回写完成" },
          "409": { description: "未确认或不可回写" },
          "429": { description: "回写限流" }
        }
      }
    },
    "/writeback/eligible": {
      get: {
        tags: ["Writeback"],
        summary: "获取可回写任务列表",
        responses: { "200": { description: "可回写任务列表" } }
      }
    },
    "/writeback/history": {
      get: {
        tags: ["Writeback"],
        summary: "获取回写历史",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" as const } },
          { name: "pageSize", in: "query", schema: { type: "integer" as const } }
        ],
        responses: { "200": { description: "回写历史（分页）" } }
      }
    },
    "/audit": {
      get: {
        tags: ["Audit"],
        summary: "查询审计日志",
        description: "需要 audit:read 权限。",
        parameters: [
          { name: "take", in: "query", schema: { type: "integer" as const } },
          { name: "page", in: "query", schema: { type: "integer" as const } },
          { name: "pageSize", in: "query", schema: { type: "integer" as const } },
          { name: "action", in: "query", schema: { type: "string" as const } },
          { name: "objectType", in: "query", schema: { type: "string" as const } }
        ],
        responses: { "200": { description: "审计日志列表" } }
      }
    },
    "/knowledge": {
      get: {
        tags: ["Knowledge"],
        summary: "获取知识库条目",
        parameters: [
          { name: "fieldKey", in: "query", schema: { type: "string" as const } },
          { name: "kind", in: "query", schema: { type: "string" as const } }
        ],
        responses: { "200": { description: "知识库条目列表" } }
      },
      post: {
        tags: ["Knowledge"],
        summary: "创建知识库条目",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/KnowledgeEntry" } } } },
        responses: { "201": { description: "条目已创建" } }
      }
    }
  }
};
