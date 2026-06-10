import { useMemo } from "react";
import { Button } from "@arco-design/web-react";
import { HelpCircle } from "lucide-react";
import { driver, type DriveStep } from "driver.js";
import { selectGuideTarget } from "./StepGuideTargets";
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
    selector: "[data-guide='new-recognition']",
    title: "新建识别",
    description: "上传病历图片或 PDF，并选择 schema、adapter、provider 和隐私策略。"
  },
  {
    selector: "[data-guide='schema-selection']",
    title: "Schema 选择",
    description: "选择抽取模板，决定字段、证据、归一化和置信度阈值。"
  },
  {
    selector: "[data-guide='field-evidence']",
    title: "字段证据",
    description: "字段候选值必须能回到 OCR 文本、页码或定位证据。"
  },
  {
    selector: "[data-guide='langgraph-workflow']",
    title: "LangGraph 工作流",
    description: "跟踪 OCR、抽取、校验、复核和写回准备等节点状态。"
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
  },
  {
    selector: "[data-guide='navigation']",
    title: "主导航",
    description: "在识别、Schema、Provider、写回、评估和审计页面之间切换。"
  }
];

function resolveAvailableSteps(steps: GuideStepConfig[]): DriveStep[] {
  // driver.js 如果收到 selector 字符串，会自行选择页面上的第一个命中元素。
  // 这里先解析成真实 Element，确保同名 data-guide 优先高亮页面主体控件，而不是侧边栏入口。
  return steps.flatMap((step): DriveStep[] => {
    const candidates = Array.from(document.querySelectorAll(step.selector)).map((element) => ({
      element,
      isInsideNavigation: Boolean(element.closest("[data-guide='navigation']"))
    }));
    const target = selectGuideTarget(candidates);

    if (!target) {
      return [];
    }

    return [{
      element: target,
      popover: {
        title: step.title,
        description: step.description
      }
    }];
  });
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
    <Button className="icon-text-button" type="outline" onClick={startGuide} aria-label="打开页面引导" icon={<HelpCircle size={16} aria-hidden="true" />}>
      引导
    </Button>
  );
}
