import { Alert, Button, Card, Space, Tag } from "@arco-design/web-react";
import { AppIcon, commonUiIcons, navigationIcons, statusIcons } from "../../../icons/appIcons";
import type { ValidationResult } from "./schemaStudioData";

type ValidationResultsPanelProps = {
  results: ValidationResult[];
  actionState: {
    isRunning: boolean;
    message: string;
    error: string;
  };
  onValidate: () => void;
};

export function ValidationResultsPanel({
  results,
  actionState,
  onValidate
}: ValidationResultsPanelProps) {
  return (
    <Card className="panel studio-panel" aria-labelledby="schema-validation-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-validation-title">验证结果</h2>
          <p>发布前的字段覆盖、规则冲突与生产准入检查。</p>
        </div>
        <Space>
          <Tag color="arcoblue">{results.length} 项检查</Tag>
          <Button
            type="outline"
            onClick={onValidate}
            disabled={actionState.isRunning}
            loading={actionState.isRunning}
            icon={actionState.isRunning ? <AppIcon icon={commonUiIcons.loading} size="sm" /> : <AppIcon icon={navigationIcons.brand} size="sm" />}
          >
            {actionState.isRunning ? "验证中" : "验证草稿"}
          </Button>
        </Space>
      </div>

      {actionState.error ? (
        <Alert type="error" showIcon content={`验证接口失败：${actionState.error}`} />
      ) : null}
      {actionState.message ? (
        <Alert type="success" showIcon title="验证请求已发送" content={actionState.message} />
      ) : null}

      <div className="metric-grid">
        {results.map((result) => {
          const resultIcon =
            result.level === "success"
              ? statusIcons.success
              : result.level === "warning"
                ? statusIcons.warning
                : statusIcons.danger;
          const resultTone =
            result.level === "success" ? "green" : result.level === "warning" ? "orange" : "red";

          return (
            <Card className="metric-card" key={result.id}>
              <div className="toolbar">
                <AppIcon icon={resultIcon} tone={resultTone} tile />
                <Tag color={result.level === "success" ? "green" : result.level === "warning" ? "orange" : "red"}>
                  {result.level === "success"
                    ? "通过"
                    : result.level === "warning"
                      ? "警告"
                      : "阻断"}
                </Tag>
              </div>
              <h3>{result.title}</h3>
              <p>{result.target}</p>
              <p>{result.detail}</p>
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
