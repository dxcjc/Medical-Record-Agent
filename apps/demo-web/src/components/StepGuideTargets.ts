export type GuideTargetCandidate<TElement> = {
  element: TElement;
  isInsideNavigation: boolean;
};

export function selectGuideTarget<TElement>(candidates: readonly GuideTargetCandidate<TElement>[]) {
  // 同一个 data-guide 可能同时挂在侧边栏入口和页面主体控件上。
  // 引导的目标是帮助用户理解当前页面，所以先选主体控件；如果当前页没有主体目标，再退回导航入口。
  return candidates.find((candidate) => !candidate.isInsideNavigation)?.element ?? candidates[0]?.element;
}
