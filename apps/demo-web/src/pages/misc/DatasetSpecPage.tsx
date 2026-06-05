import { ClipboardCheck, ShieldCheck } from "lucide-react";

const checklistItems = [
  "dataset 和 sample 必须标记 deidentified=true",
  "真实样本只在受控本地或内网评估运行",
  "CI 只运行 synthetic samples 和 mock provider",
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
        <span className="status-pill status-pill-success">
          <ShieldCheck size={16} aria-hidden="true" />
          synthetic-first
        </span>
      </header>

      <section className="panel">
        <h2>导入前检查</h2>
        <div className="checklist">
          {checklistItems.map((item) => (
            <div key={item} className="checklist-row">
              <ClipboardCheck size={17} aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>JSON 示例</h2>
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
      </section>
    </main>
  );
}
