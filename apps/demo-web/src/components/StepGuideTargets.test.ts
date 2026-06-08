import { describe, expect, it } from "vitest";

import { selectGuideTarget } from "./StepGuideTargets";

describe("StepGuideTargets", () => {
  it("同名引导目标同时出现在侧边栏和页面主体时，优先选择页面主体控件", () => {
    const sidebarLink = { id: "sidebar-new-recognition" };
    const mainPanel = { id: "main-new-recognition-panel" };

    expect(
      selectGuideTarget([
        { element: sidebarLink, isInsideNavigation: true },
        { element: mainPanel, isInsideNavigation: false }
      ])
    ).toBe(mainPanel);
  });

  it("当前页面没有主体目标时，保留侧边栏目标作为兜底", () => {
    const sidebarLink = { id: "sidebar-writeback" };

    expect(
      selectGuideTarget([
        { element: sidebarLink, isInsideNavigation: true }
      ])
    ).toBe(sidebarLink);
  });
});
