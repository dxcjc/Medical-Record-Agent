import { Button, Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import { AppIcon, navigationIcons } from "../../../icons/appIcons";
import type { SchemaRecord } from "./schemaStudioData";

type SchemaListPanelProps = {
  schemas: SchemaRecord[];
  selectedSchemaId: string;
  onSelectSchema: (schemaId: string) => void;
};

export function SchemaListPanel({
  schemas,
  selectedSchemaId,
  onSelectSchema
}: SchemaListPanelProps) {
  const columns: TableColumnProps<SchemaRecord>[] = [
    {
      title: "名称",
      dataIndex: "name",
      render: (_, schema) => {
        const isSelected = schema.id === selectedSchemaId;
        return (
          <Button type={isSelected ? "primary" : "outline"} onClick={() => onSelectSchema(schema.id)} aria-pressed={isSelected}>
            {schema.name}
          </Button>
        );
      },
    },
    {
      title: "业务域",
      dataIndex: "domain",
      render: (_, schema) => <Tag color="arcoblue">{schema.domain}</Tag>,
    },
    { title: "生产版本", dataIndex: "activeVersion" },
    { title: "责任组", dataIndex: "owner" },
  ];

  return (
    <Card className="panel studio-panel" aria-labelledby="schema-list-title" data-guide="schema-selection">
      <div className="toolbar">
        <div>
          <h2 id="schema-list-title">Schema 列表</h2>
          <p>按业务域查看当前生产版本与待发布草稿。</p>
        </div>
        <AppIcon icon={navigationIcons.schemaStudio} tone="blue" tile />
      </div>

      <div className="table-scroll">
        <Table columns={columns} data={schemas} rowKey="id" pagination={false} scroll={{ x: 720 }} />
      </div>
    </Card>
  );
}
