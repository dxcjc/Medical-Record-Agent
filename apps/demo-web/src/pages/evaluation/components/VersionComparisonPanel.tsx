import { Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import { AppIcon, navigationIcons } from "../../../icons/appIcons";
import type { VersionComparisonRow } from "./evaluationData";

type VersionComparisonPanelProps = {
  rows: VersionComparisonRow[];
};

export function VersionComparisonPanel({ rows }: VersionComparisonPanelProps) {
  const columns: TableColumnProps<VersionComparisonRow>[] = [
    { title: "指标", dataIndex: "metric" },
    { title: "生产基线", dataIndex: "baseline" },
    { title: "候选版本", dataIndex: "candidate" },
    { title: "结论", dataIndex: "verdict", render: (_, row) => <Tag color={row.verdict.includes("优") || row.verdict.includes("通过") ? "green" : "orange"}>{row.verdict}</Tag> },
  ];

  return (
    <Card className="panel studio-panel" aria-labelledby="evaluation-comparison-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-comparison-title">Version Comparison</h2>
          <p>生产基线与候选版本在核心指标上的差异。</p>
        </div>
        <AppIcon icon={navigationIcons.schemaStudio} tone="purple" tile />
      </div>

      <div className="table-scroll">
        <Table columns={columns} data={rows} rowKey="metric" pagination={false} scroll={{ x: 760 }} />
      </div>
    </Card>
  );
}
