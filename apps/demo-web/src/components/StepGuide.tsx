import { useMemo } from "react";
import { HelpCircle } from "lucide-react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

type GuideStepConfig = {
  selector: string;
  title: string;
  description: string;
};

const guideSteps: GuideStepConfig[] = [
  {
    selector: "[data-guide='environment-status']",
    title: "环境状态",
    description: "查看 API、Provider、评估集和写回通道是否处于可演示状态。"
  },
  {
    selector: "[data-guide='navigation']",
    title: "主导航",
    description: "在识别、Schema、Provider、写回、评估和审计页面之间切换。"
  },
  {
    selector: "[data-guide='new-recognition']",
    title: "新建识别",
    description: "上传病历图片或 PDF，并选择 schema、adapter、provider 和隐私策略。"
  },
  {
    selector: "[data-guide='schema-selection']",
    title: "Schema 选择",
    description: "字段配置决定抽取哪些临床信息，以及证据和置信度阈值。"
  },
  {
    selector: "[data-guide='field-evidence']",
    title: "字段证据",
    description: "字段候选值必须能回到 OCR 文本、页码或定位证据。"
  },
  {
    selector: "[data-guide='auto-decision']",
    title: "自动决策",
    description: "绿色可自动写回，黄色进入复核，红色阻断写回。"
  },
  {
    selector: "[data-guide='feedback']",
    title: "反馈沉淀",
    description: "人工纠偏会沉淀为评估样本、规则候选和后续优化依据。"
  },
  {
    selector: "[data-guide='writeback']",
    title: "写回确认",
    description: "写回前必须确认任务状态、目标系统、payload 和权限。"
  },
  {
    selector: "[data-guide='schema-publish']",
    title: "Schema 发布",
    description: "发布、停用、回滚都会影响生产识别和写回策略。"
  },
  {
    selector: "[data-guide='evaluation']",
    title: "评估运行",
    description: "用合成或真实脱敏样本评估字段准确率、证据覆盖和复核召回。"
  }
];

function resolveAvailableSteps(steps: GuideStepConfig[]): DriveStep[] {
  return steps
    .filter((step) => document.querySelector(step.selector))
    .map((step) => ({
      element: step.selector,
      popover: {
        title: step.title,
        description: step.description
      }
    }));
}

export function StepGuide() {
  const startGuide = useMemo(
    () => () => {
      const steps = resolveAvailableSteps(guideSteps);
      if (steps.length === 0) {
        return;
      }

      driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "下一步",
        prevBtnText: "上一步",
        doneBtnText: "完成",
        steps
      }).drive();
    },
    []
  );

  return (
    <button className="icon-text-button" type="button" onClick={startGuide} aria-label="打开页面引导">
      <HelpCircle size={16} aria-hidden="true" />
      引导
    </button>
  );
}
