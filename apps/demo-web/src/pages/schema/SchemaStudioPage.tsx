import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, commonUiIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { DraftEditorPanel } from "./components/DraftEditorPanel";
import { SchemaFlowPanel } from "./components/SchemaFlowPanel";
import { SchemaListPanel } from "./components/SchemaListPanel";
import { ValidationResultsPanel } from "./components/ValidationResultsPanel";
import { VersionListPanel } from "./components/VersionListPanel";
import {
  initialDraftFields,
  schemaRecords,
  schemaVersionsById,
  validationResults,
  type FlowState,
  type SchemaRecord,
  type SchemaStatus,
  type SchemaVersion,
  type SchemaFieldDraft,
  type ValidationResult
} from "./components/schemaStudioData";

type ApiLoadState =
  | { status: "loading"; count: number; statusSummary: string; error: null }
  | { status: "success"; count: number; statusSummary: string; error: null }
  | { status: "error"; count: number; statusSummary: string; error: string };

type ActionKey = "validate" | "publish" | "compare" | "deactivate" | "rollback";

type ActionState = Record<
  ActionKey,
  {
    isRunning: boolean;
    message: string;
    error: string;
  }
>;

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function readStringField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readNumberField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readBooleanField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readArrayField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function normalizeSchemaStatus(value: string | null): SchemaStatus {
  if (value === "draft" || value === "active" || value === "inactive" || value === "archived") {
    return value;
  }

  if (value === "published" || value === "ready") {
    return "active";
  }

  return "archived";
}

function formatSchemaVersion(value: string | number | null): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? `v${value}` : "未知版本";
  }

  return value && value.length > 0 ? value : "未知版本";
}

function mapApiSchemaItem(item: unknown, index: number) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const source = item as Record<string, unknown>;
  const schemaKey = readStringField(source, ["schemaKey", "key", "id"]);
  const versionId = readStringField(source, ["id", "versionId"]);
  if (!schemaKey || !versionId) {
    return null;
  }

  const fallbackSchema = schemaRecords.find((schema) => schema.id === schemaKey) ?? schemaRecords[index % schemaRecords.length];
  const fallbackVersion = fallbackSchema ? schemaVersionsById[fallbackSchema.id]?.[0] : undefined;
  const displayName = readStringField(source, ["displayName", "name"]) ?? fallbackSchema?.name ?? schemaKey;
  const status = normalizeSchemaStatus(readStringField(source, ["status", "state", "lifecycleStatus"]));
  const rawVersion = readStringField(source, ["version", "versionName", "semver"]) ?? readNumberField(source, ["version"]);
  const versionText = formatSchemaVersion(rawVersion);

  const record: SchemaRecord = {
    id: schemaKey,
    name: displayName,
    domain: readStringField(source, ["domain", "schemaType"]) ?? fallbackSchema?.domain ?? "真实 API",
    owner: readStringField(source, ["owner", "createdBy"]) ?? fallbackSchema?.owner ?? "后端返回",
    activeVersion: status === "active" ? versionText : fallbackSchema?.activeVersion ?? versionText,
    draftVersion: fallbackSchema?.draftVersion ?? "后端未返回草稿",
    affectedPipelines: fallbackSchema?.affectedPipelines ?? ["真实 Schema API"],
    deactivationRisk: fallbackSchema?.deactivationRisk ?? "中"
  };

  const version: SchemaVersion = {
    id: versionId,
    version: versionText,
    status,
    author: readStringField(source, ["author", "createdBy", "updatedBy"]) ?? fallbackVersion?.author ?? "后端返回",
    updatedAt: readStringField(source, ["updatedAt", "createdAt"]) ?? fallbackVersion?.updatedAt ?? "后端未返回",
    coverage: readNumberField(source, ["coverage", "fieldCoverage"]) ?? fallbackVersion?.coverage ?? 0,
    errorRate: readNumberField(source, ["errorRate", "criticalErrorRate"]) ?? fallbackVersion?.errorRate ?? 0,
    changeSummary: readStringField(source, ["changelog", "changeSummary", "description"]) ?? fallbackVersion?.changeSummary ?? "后端版本记录"
  };

  return { record, version };
}

function mapApiSchemas(items: unknown[]) {
  const records = new Map<string, SchemaRecord>();
  const versionsById: Record<string, SchemaVersion[]> = {};

  items.forEach((item, index) => {
    const mapped = mapApiSchemaItem(item, index);
    if (!mapped) {
      return;
    }

    const current = records.get(mapped.record.id);
    records.set(mapped.record.id, current ? { ...current, ...mapped.record } : mapped.record);
    versionsById[mapped.record.id] = [...(versionsById[mapped.record.id] ?? []), mapped.version];
  });

  return {
    records: Array.from(records.values()),
    versionsById
  };
}

function summarizeSchemaStatuses(items: unknown[]) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    // 后端 schema 列表字段可能仍在演进，页面只读取常见状态字段，读不到时归入“未知”。
    const status = readStringField(item, ["status", "state", "lifecycleStatus", "versionStatus"]) ?? "未知";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  if (counts.size === 0) {
    return "暂无状态";
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${status} ${count}`)
    .join("、");
}

function buildDraftDefinition(fields: SchemaFieldDraft[]) {
  return {
    fields: fields.map((field) => ({
      name: field.name,
      metadata: field.metadata,
      aliases: field.aliases,
      enumMap: field.enumMap,
      validators: field.validators,
      normalizers: field.normalizers,
      adapterHints: field.adapterHints
    }))
  };
}

export function canPublishSchema(hasPermission: (permission: string) => boolean) {
  return hasPermission("schema:publish");
}

export function parseSchemaValidationResults(response: unknown): ValidationResult[] {
  const validation = response && typeof response === "object" && "validation" in response
    ? (response as { validation?: unknown }).validation
    : response;
  const valid = readBooleanField(validation, ["valid", "isValid"]);
  const errors = readArrayField(validation, ["errors", "issues", "violations"]) ?? [];

  if (valid === true && errors.length === 0) {
    return [
      {
        id: "schema-validation-pass",
        level: "success",
        title: "Schema 校验通过",
        target: "真实 Schema API",
        detail: "后端 validateDraft 返回 valid=true，当前草稿满足发布前基础校验。"
      }
    ];
  }

  return errors.map((item, index) => {
    const code = readStringField(item, ["code", "rule", "id"]) ?? `SCHEMA_VALIDATION_ERROR_${index + 1}`;
    const path = readStringField(item, ["path", "target", "fieldKey"]) ?? "schema";
    const message = readStringField(item, ["message", "detail", "description"]) ?? "后端返回了未命名的 Schema 校验问题。";

    return {
      id: code,
      level: "error",
      title: code,
      target: path,
      detail: message
    };
  });
}

export default function SchemaStudioPage() {
  const { api, hasPermission } = useAuth();
  const firstSchema = schemaRecords[0];
  if (!firstSchema) {
    throw new Error("Schema Studio 缺少演示 Schema 数据");
  }

  const fallbackSchemaId = firstSchema.id;
  const [selectedSchemaId, setSelectedSchemaId] = useState(firstSchema.id);
  const firstVersion = schemaVersionsById[firstSchema.id]?.[0];

  const [selectedVersionId, setSelectedVersionId] = useState(firstVersion?.id ?? "");
  const canPublish = canPublishSchema(hasPermission);
  const [draftFields, setDraftFields] = useState<SchemaFieldDraft[]>(initialDraftFields);
  const [apiSchemaState, setApiSchemaState] = useState<ApiLoadState>({
    status: "loading",
    count: schemaRecords.length,
    statusSummary: "读取中",
    error: null
  });
  const [actionState, setActionState] = useState<ActionState>({
    validate: { isRunning: false, message: "", error: "" },
    publish: { isRunning: false, message: "", error: "" },
    compare: { isRunning: false, message: "", error: "" },
    deactivate: { isRunning: false, message: "", error: "" },
    rollback: { isRunning: false, message: "", error: "" }
  });
  const [apiSchemaRecords, setApiSchemaRecords] = useState<SchemaRecord[]>([]);
  const [apiSchemaVersionsById, setApiSchemaVersionsById] = useState<Record<string, SchemaVersion[]>>({});
  const [currentValidationResults, setCurrentValidationResults] = useState<ValidationResult[]>(validationResults);
  const [flowState, setFlowState] = useState<FlowState>({
    publishRequested: false,
    deactivateRequested: false,
    rollbackTarget: firstSchema.activeVersion,
    compareBase: firstSchema.activeVersion
  });

  const displaySchemaRecords = apiSchemaRecords.length > 0 ? apiSchemaRecords : schemaRecords;
  const displaySchemaVersionsById = apiSchemaRecords.length > 0 ? apiSchemaVersionsById : schemaVersionsById;
  const displayFirstSchema = displaySchemaRecords[0] ?? firstSchema;
  const displayVersions = displaySchemaVersionsById[selectedSchemaId] ?? [];
  const selectedSchema = displaySchemaRecords.find((schema) => schema.id === selectedSchemaId) ?? displayFirstSchema;
  const selectedVersion = displayVersions.find((version) => version.id === selectedVersionId) ?? displayVersions[0];
  const selectedDraftVersion = displayVersions.find((version) => version.status === "draft") ?? selectedVersion;

  async function refreshSchemas() {
    const response = await api.listSchemas();
    const mapped = mapApiSchemas(response.items);

    setApiSchemaRecords(mapped.records);
    setApiSchemaVersionsById(mapped.versionsById);
    setSelectedSchemaId((currentId) => {
      const stillExists = mapped.records.some((schema) => schema.id === currentId);
      return stillExists ? currentId : mapped.records[0]?.id ?? fallbackSchemaId;
    });
    setSelectedVersionId((currentVersionId) => {
      const allVersions = Object.values(mapped.versionsById).flat();
      const stillExists = allVersions.some((version) => version.id === currentVersionId);
      return stillExists ? currentVersionId : allVersions[0]?.id ?? "";
    });

    return { response, mapped };
  }

  useEffect(() => {
    let shouldIgnore = false;

    async function loadSchemas() {
      setApiSchemaState((currentState) => ({
        status: "loading",
        count: currentState.count,
        statusSummary: currentState.statusSummary,
        error: null
      }));

      try {
        const response = await api.listSchemas();
        const mapped = mapApiSchemas(response.items);

        if (shouldIgnore) {
          return;
        }

        setApiSchemaRecords(mapped.records);
        setApiSchemaVersionsById(mapped.versionsById);
        setSelectedSchemaId((currentId) => {
          const stillExists = mapped.records.some((schema) => schema.id === currentId);
          return stillExists ? currentId : mapped.records[0]?.id ?? fallbackSchemaId;
        });
        setSelectedVersionId((currentVersionId) => {
          const allVersions = Object.values(mapped.versionsById).flat();
          const stillExists = allVersions.some((version) => version.id === currentVersionId);
          return stillExists ? currentVersionId : allVersions[0]?.id ?? "";
        });
        setApiSchemaState({
          status: "success",
          count: mapped.records.length > 0 ? mapped.records.length : response.items.length,
          statusSummary: summarizeSchemaStatuses(response.items),
          error: null
        });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setApiSchemaState({
          status: "error",
          count: schemaRecords.length,
          statusSummary: "静态兜底",
          error: formatApiError(error, "Schema API 暂不可用，继续展示静态演示列表。")
        });
      }
    }

    void loadSchemas();

    return () => {
      shouldIgnore = true;
    };
  }, [api]);

  const compareRows = useMemo(() => {
    const draftVersion = displayVersions.find((version) => version.status === "draft") ?? selectedVersion;
    const compareBase = displayVersions.find((version) => version.version === flowState.compareBase) ?? selectedVersion;

    if (!draftVersion || !compareBase) {
      return [];
    }

    return [
      {
        metric: "字段覆盖率",
        draft: `${draftVersion.coverage.toFixed(1)}%`,
        base: `${compareBase.coverage.toFixed(1)}%`,
        impact: draftVersion.coverage >= compareBase.coverage ? "提升" : "下降"
      },
      {
        metric: "错误率",
        draft: `${draftVersion.errorRate.toFixed(1)}%`,
        base: `${compareBase.errorRate.toFixed(1)}%`,
        impact: draftVersion.errorRate <= compareBase.errorRate ? "降低" : "升高"
      },
      {
        metric: "变更摘要",
        draft: draftVersion.changeSummary,
        base: compareBase.changeSummary,
        impact: "需人工确认"
      }
    ];
  }, [displayVersions, flowState.compareBase, selectedVersion]);

  const handleSelectSchema = (schemaId: string) => {
    const nextSchema = displaySchemaRecords.find((schema) => schema.id === schemaId);
    const nextVersions = displaySchemaVersionsById[schemaId] ?? [];
    const nextVersion = nextVersions[0];

    setSelectedSchemaId(schemaId);
    setSelectedVersionId(nextVersion?.id ?? "");

    if (nextSchema) {
      // 切换 Schema 时同步操作流默认目标，避免继续显示上一条 Schema 的生产版本。
      setFlowState({
        publishRequested: false,
        deactivateRequested: false,
        rollbackTarget: nextSchema.activeVersion,
        compareBase: nextSchema.activeVersion
      });
    }
  };

  const handleUpdateField = (
    fieldId: string,
    key: keyof Omit<SchemaFieldDraft, "id">,
    value: string
  ) => {
    setDraftFields((currentFields) =>
      currentFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              [key]: value
            }
          : field
      )
    );
  };

  const handleAddField = () => {
    setDraftFields((currentFields) => [
      ...currentFields,
      {
        id: `custom-${currentFields.length + 1}`,
        name: "newField",
        metadata: "字段说明；类型；是否必填；业务用途。",
        aliases: "请输入别名，使用逗号分隔。",
        enumMap: "源值=>标准值",
        validators: "required; 自定义校验规则。",
        normalizers: "trim; 自定义归一化规则。",
        adapterHints: "说明 OCR、LLM 或规则 adapter 如何抽取该字段。"
      }
    ]);
  };

  const handleRemoveField = (fieldId: string) => {
    setDraftFields((currentFields) =>
      currentFields.length > 1 ? currentFields.filter((field) => field.id !== fieldId) : currentFields
    );
  };

  const runSchemaAction = async (
    action: ActionKey,
    operation: () => Promise<unknown>,
    successMessage: string,
    fallbackError: string,
    onSuccess?: () => void
  ) => {
    setActionState((currentState) => ({
      ...currentState,
      [action]: {
        isRunning: true,
        message: "",
        error: ""
      }
    }));

    try {
      await operation();
      onSuccess?.();

      setActionState((currentState) => ({
        ...currentState,
        [action]: {
          isRunning: false,
          message: successMessage,
          error: ""
        }
      }));
    } catch (error) {
      setActionState((currentState) => ({
        ...currentState,
        [action]: {
          isRunning: false,
          message: "",
          error: formatApiError(error, fallbackError)
        }
      }));
    }
  };

  const handleValidateDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "validate",
      async () => {
        const response = await api.validateSchemaDraft(draftId, { definition: buildDraftDefinition(draftFields) });
        setCurrentValidationResults(parseSchemaValidationResults(response));
        return response;
      },
      `已提交 ${selectedSchema.draftVersion} 的真实验证请求。`,
      "草稿验证失败，请稍后重试。"
    );
  };

  const handlePublishDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "publish",
      () => api.publishSchemaDraft(draftId, `${selectedSchema.name} 从 Schema Studio 发布`),
      `已提交 ${selectedSchema.draftVersion} 的发布请求。`,
      "草稿发布失败，请确认权限和草稿状态。",
      () =>
        setFlowState((currentState) => ({
          ...currentState,
          publishRequested: true
        }))
    );
  };

  const handleDeactivateVersion = () => {
    if (!selectedVersion) {
      return;
    }

    void runSchemaAction(
      "deactivate",
      () => api.deactivateSchemaVersion(selectedVersion.id),
      `已提交 ${selectedVersion.version} 的真实停用请求。`,
      "Schema 停用失败，请确认权限和版本状态。",
      () => {
        setFlowState((currentState) => ({
          ...currentState,
          deactivateRequested: true
        }));
        void refreshSchemas();
      }
    );
  };

  const handleRollbackTargetChange = (rollbackTarget: string) => {
    setFlowState((currentState) => ({
      ...currentState,
      rollbackTarget
    }));

    const targetVersion = displayVersions.find((version) => version.version === rollbackTarget);
    if (!targetVersion) {
      return;
    }

    void runSchemaAction(
      "rollback",
      () => api.rollbackSchemaVersion(targetVersion.id),
      `已提交 ${rollbackTarget} 的真实回滚请求。`,
      "Schema 回滚失败，请确认目标版本仍存在。",
      () => {
        void refreshSchemas();
      }
    );
  };

  const handleCompareVersions = () => {
    const draftVersion = selectedDraftVersion?.version ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "compare",
      () =>
        api.compareSchemaVersions(selectedSchema.id, {
          left: draftVersion,
          right: flowState.compareBase
        }),
      `已完成 ${draftVersion} 与 ${flowState.compareBase} 的真实比较请求。`,
      "版本比较失败，请确认版本号仍存在。"
    );
  };

  return (
    <main className="app-page">
      <header className="toolbar">
        <div>
          <h1>Schema Studio</h1>
          <p>面向医疗结构化抽取的 Schema 版本、草稿、验证与生产变更控制台。</p>
        </div>
        <span className="status-pill">
          <AppIcon icon={dashboardMetricIcons.dataset} size="sm" />
          {selectedSchema.domain}
        </span>
      </header>

      <section className="warning-box" role="alert">
        <AppIcon icon={statusIcons.warning} tone="orange" />
        <div>
          <strong>生产影响提示</strong>
          <p>
            当前草稿会影响 {selectedSchema.affectedPipelines.join("、")}。
            发布、停用或回滚前请确认验证结果和业务窗口。
          </p>
        </div>
      </section>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="status-pill">Active</span>
          <h2>{selectedSchema.activeVersion}</h2>
          <p>当前生产版本</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">Draft</span>
          <h2>{selectedSchema.draftVersion}</h2>
          <p>待发布草稿</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">
            {apiSchemaState.status === "loading" ? (
              <AppIcon icon={commonUiIcons.loading} size="xs" />
            ) : null}
            API Schema
          </span>
          <h2>{apiSchemaState.status === "loading" ? "读取中" : displaySchemaRecords.length}</h2>
          <p>{apiSchemaState.statusSummary}</p>
        </article>
      </div>

      {apiSchemaState.error ? (
        <div className="form-error" role="alert">
          Schema 列表加载失败：{apiSchemaState.error}。下方静态 Schema 列表仍可继续使用。
        </div>
      ) : null}

      <div className="form-grid">
        <SchemaListPanel
          schemas={displaySchemaRecords}
          selectedSchemaId={selectedSchemaId}
          onSelectSchema={handleSelectSchema}
        />
        <VersionListPanel
          versions={displayVersions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
        />
      </div>

      <DraftEditorPanel
        fields={draftFields}
        onUpdateField={handleUpdateField}
        onAddField={handleAddField}
        onRemoveField={handleRemoveField}
      />

      <ValidationResultsPanel
        results={currentValidationResults}
        actionState={actionState.validate}
        onValidate={handleValidateDraft}
      />

      <SchemaFlowPanel
        schema={selectedSchema}
        versions={displayVersions}
        canPublish={canPublish}
        flowState={flowState}
        actionState={{
          publish: actionState.publish,
          compare: actionState.compare
        }}
        onPublish={handlePublishDraft}
        onDeactivate={handleDeactivateVersion}
        onRollbackTargetChange={handleRollbackTargetChange}
        onCompareBaseChange={(compareBase) =>
          setFlowState((currentState) => ({
            ...currentState,
            compareBase
          }))
        }
        onCompare={handleCompareVersions}
      />

      {actionState.deactivate.error || actionState.deactivate.message || actionState.rollback.error || actionState.rollback.message ? (
        <section className="panel" aria-labelledby="schema-change-result-title">
          <h2 id="schema-change-result-title">真实变更请求状态</h2>
          {actionState.deactivate.error ? (
            <p className="form-error" role="alert">停用失败：{actionState.deactivate.error}</p>
          ) : null}
          {actionState.deactivate.message ? <p>{actionState.deactivate.message}</p> : null}
          {actionState.rollback.error ? (
            <p className="form-error" role="alert">回滚失败：{actionState.rollback.error}</p>
          ) : null}
          {actionState.rollback.message ? <p>{actionState.rollback.message}</p> : null}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="schema-compare-title">
        <div className="toolbar">
          <div>
            <h2 id="schema-compare-title">版本比较</h2>
            <p>展示草稿与基线版本的关键生产指标差异。</p>
          </div>
          <AppIcon icon={navigationIcons.schemaStudio} tone="purple" tile />
        </div>

        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">草稿</th>
              <th scope="col">基线</th>
              <th scope="col">影响</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.draft}</td>
                <td>{row.base}</td>
                <td>{row.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
