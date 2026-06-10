import { Alert, Card, Tag } from "@arco-design/web-react";
import { ClipboardCheck, Database, FileJson, ShieldCheck } from "lucide-react";

const checklistItems = [
  "dataset 和 sample 必须标记 deidentified=true",
  "真实样本只在受控本地或内网评估运行",
  "CI 只运行 synthetic samples 和测试替身，不作为真实操作路径",
  "groundTruth 必须包含字段值、归一化值、证据和 needsReview 口径",
  "写入评估集前必须重新执行脱敏检查"
];

export default function DatasetSpecPage() {
  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Evaluation Dataset</p>
          <h1>数据集规范</h1>
          <p>评估样本的安全边界、metadata、ground truth 和 evidence 标注口径。</p>
        </div>
        <Tag color="green" className="status-pill status-pill-success">
          <ShieldCheck size={16} aria-hidden="true" />
          synthetic-first
        </Tag>
      </header>

      <section className="metric-grid" aria-label="数据集规范指标">
        <Card className="metric-card">
          <Tag color="arcoblue">
            <Database size={14} aria-hidden="true" />
            Dataset
          </Tag>
          <h2>deidentified</h2>
          <p>导入前必须完成脱敏标记</p>
        </Card>
        <Card className="metric-card">
          <Tag color="green">
            <ShieldCheck size={14} aria-hidden="true" />
            Ground Truth
          </Tag>
          <h2>evidence</h2>
          <p>字段真值需要可追溯证据</p>
        </Card>
        <Card className="metric-card">
          <Tag color="orange">
            <FileJson size={14} aria-hidden="true" />
            Metadata
          </Tag>
          <h2>batch</h2>
          <p>保留来源、批次和复核记录</p>
        </Card>
      </section>

      <Alert type="info" showIcon title="评测数据边界" content="CI 与公开演示只使用 synthetic samples 和测试替身；真实识别/评测必须先配置真实 OCR/LLM Provider，真实脱敏样本仅允许在受控内网评估链路运行。" />

      <Card className="panel">
        <div className="panel-header">
          <h2>
            <ClipboardCheck size={17} aria-hidden="true" />
            导入前检查
          </h2>
          <Tag color="green">5 项</Tag>
        </div>
        <div className="checklist">
          {checklistItems.map((item) => (
            <div key={item} className="checklist-row">
              <ClipboardCheck size={17} aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="panel">
        <div className="panel-header">
          <h2>
            <FileJson size={17} aria-hidden="true" />
            JSON 示例
          </h2>
          <Tag color="arcoblue">sample schema</Tag>
        </div>
        <pre className="payload-preview">
          {JSON.stringify(
            {
              datasetId: "lims-clinical-info-ci-v1",
              sourceType: "synthetic",
              deidentified: true,
              samples: [
                {
                  sampleId: "synthetic-sample-001",
                  groundTruth: [
                    {
                      fieldKey: "clinicalDiagnosis",
                      value: "肺腺癌",
                      normalizedValue: "肺腺癌",
                      needsReview: false,
                      evidence: [{ text: "临床诊断：肺腺癌", pageNumber: 1 }]
                    }
                  ]
                }
              ]
            },
            null,
            2
          )}
        </pre>
      </Card>
    </main>
  );
}
