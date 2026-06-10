import { Button, Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import { AppIcon, navigationIcons } from "../../../icons/appIcons";
import type { SchemaVersion } from "./schemaStudioData";
import { statusLabels } from "./schemaStudioData";

type VersionListPanelProps = {
  versions: SchemaVersion[];
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
};

export function VersionListPanel({
  versions,
  selectedVersionId,
  onSelectVersion
}: VersionListPanelProps) {
  const statusColor: Record<SchemaVersion["status"], string> = {
    draft: "orange",
    active: "green",
    inactive: "gray",
    archived: "gray",
  };
  const columns: TableColumnProps<SchemaVersion>[] = [
    {
      title: "版本",
      dataIndex: "version",
      render: (_, version) => {
        const isSelected = version.id === selectedVersionId;
        return (
          <Button type={isSelected ? "primary" : "outline"} onClick={() => onSelectVersion(version.id)} aria-pressed={isSelected}>
            {version.version}
          </Button>
        );
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, version) => <Tag color={statusColor[version.status]}>{statusLabels[version.status]}</Tag>,
    },
    { title: "覆盖率", dataIndex: "coverage", render: (_, version) => `${version.coverage.toFixed(1)}%` },
    { title: "错误率", dataIndex: "errorRate", render: (_, version) => `${version.errorRate.toFixed(1)}%` },
    { title: "更新时间", dataIndex: "updatedAt" },
  ];

  return (
    <Card className="panel studio-panel" aria-labelledby="schema-version-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-version-title">版本列表</h2>
          <p>选择草稿、生产或历史版本进行比较与回滚。</p>
        </div>
        <AppIcon icon={navigationIcons.auditLog} tone="gray" tile />
      </div>

      <div className="table-scroll">
        <Table columns={columns} data={versions} rowKey="id" pagination={false} scroll={{ x: 720 }} />
      </div>
    </Card>
  );
}
