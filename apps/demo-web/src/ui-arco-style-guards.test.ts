import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const pageFiles = [
  "apps/demo-web/src/pages/auth/LoginPage.tsx",
  "apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx",
  "apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx",
  "apps/demo-web/src/pages/recognition/JobDetailPage.tsx",
  "apps/demo-web/src/pages/schema/SchemaStudioPage.tsx",
  "apps/demo-web/src/pages/evaluation/EvaluationPage.tsx",
  "apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx",
  "apps/demo-web/src/pages/operations/WritebackPage.tsx",
  "apps/demo-web/src/pages/operations/FeedbackSamplesPage.tsx",
  "apps/demo-web/src/pages/operations/AgentTracePage.tsx",
  "apps/demo-web/src/pages/operations/AuditLogPage.tsx",
  "apps/demo-web/src/pages/misc/DatasetSpecPage.tsx",
  "apps/demo-web/src/pages/misc/NotFoundPage.tsx",
];

describe("Arco Design 全局 UI 守护", () => {
  it("main.tsx 引入 Arco CSS，App.tsx 通过 ConfigProvider 设置主题色", () => {
    const main = read("apps/demo-web/src/main.tsx");
    const app = read("apps/demo-web/src/App.tsx");

    expect(main).toContain("@arco-design/web-react/dist/css/arco.css");
    expect(main).toContain("<App />");
    expect(app).toContain("ConfigProvider");
    expect(app).toContain('primaryColor: "#3370FF"');
  });

  it("AppShell 使用 Arco 关键组件构建企业级 Shell", () => {
    const shell = read("apps/demo-web/src/layouts/AppShell.tsx");

    for (const component of ["Button", "Input", "Badge", "Avatar", "Drawer", "Breadcrumb"]) {
      expect(shell).toContain(component);
    }
    expect(shell).toContain("@arco-design/web-react");
    expect(shell).toContain("app-sidebar");
  });

  it("多个可见页面导入并使用 @arco-design/web-react", () => {
    const importedPages = pageFiles.filter((file) => read(file).includes("@arco-design/web-react"));

    expect(importedPages.length).toBeGreaterThanOrEqual(10);
    for (const file of pageFiles.slice(0, 8)) {
      expect(read(file), file).toContain("@arco-design/web-react");
    }
  });

  it("styles.css 包含 Material + Arco token、Shell、nav-pill、页面节奏和卡片阴影", () => {
    const styles = read("apps/demo-web/src/styles.css");

    for (const token of [
      "#3370FF",
      "#F7F8FA",
      ".app-shell",
      ".app-sidebar",
      ".nav-pill",
      "--shadow-1",
      "--shadow-2",
      "--page-max-width",
      "--section-gap",
      "--card-padding",
      "0 4px 12px rgba(0, 0, 0, 0.08)"
    ]) {
      expect(styles).toContain(token);
    }
  });

  it("Open Design 参考落到专业医疗工作台 hero、状态摘要和操作面板样式", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const dashboard = read("apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx");
    const provider = read("apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx");
    const writeback = read("apps/demo-web/src/pages/operations/WritebackPage.tsx");
    const schema = read("apps/demo-web/src/pages/schema/SchemaStudioPage.tsx");
    const evaluation = read("apps/demo-web/src/pages/evaluation/EvaluationPage.tsx");

    expect(styles).toContain("Open Design");
    expect(styles).toMatch(/\.page-header\s*\{[\s\S]*border:\s*1px solid var\(--color-border\)/);
    expect(styles).toMatch(/\.page-header\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*#FFFFFF/);
    expect(styles).toMatch(/\.page-header__meta\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
    expect(styles).toMatch(/\.page-header__meta-item\s*\{[\s\S]*min-height:\s*54px/);
    expect(styles).toMatch(/\.operations-status-strip\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
    expect(styles).toMatch(/\.data-table-card\s*\{[\s\S]*overflow:\s*hidden/);

    expect(dashboard).toContain("page-header__meta");
    expect(dashboard).toContain("data-table-card");
    expect(provider).toContain("page-header__meta");
    expect(provider).toContain("operations-status-strip");
    expect(writeback).toContain("page-header__meta");
    expect(writeback).toContain("operations-status-strip");
    expect(schema).toContain("page-header__meta");
    expect(evaluation).toContain("page-header__meta");
  });

  it("Shell 顶部栏与侧栏 logo 区域统一 64px，并提供 active pill 指示条", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toContain("--header-height: 64px");
    expect(styles).toMatch(/\.brand-lockup\s*\{[\s\S]*height:\s*var\(--header-height\)/);
    expect(styles).toMatch(/\.brand-lockup\s*\{[\s\S]*max-height:\s*var\(--header-height\)/);
    expect(styles).toMatch(/\.brand-lockup\s*\{[\s\S]*flex:\s*0 0 var\(--header-height\)/);
    expect(styles).toMatch(/\.topbar\s*\{[\s\S]*min-height:\s*var\(--header-height\)/);
    expect(styles).toMatch(/\.topbar\s*\{[\s\S]*height:\s*var\(--header-height\)/);
    expect(styles).toMatch(/\.topbar\s*\{[\s\S]*max-height:\s*var\(--header-height\)/);
    expect(styles).toMatch(/\.side-nav a::before[\s\S]*width:\s*3px/);
    expect(styles).toMatch(/\.side-nav a\.active[\s\S]*background:\s*rgba\(51,\s*112,\s*255,\s*0\.1\)/);
    expect(styles).toMatch(/\.side-nav a\.active[\s\S]*font-weight:\s*700/);
  });

  it("topbar 在 tablet 宽度隐藏次要信息并保持单行截断", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const shell = read("apps/demo-web/src/layouts/AppShell.tsx");

    for (const className of ["topbar-main", "topbar-title-stack", "topbar-meta", "topbar-provider-status", "topbar-product-tag", "topbar-guide", "topbar-user-avatar"]) {
      expect(shell).toContain(className);
    }

    expect(styles).toContain("@media (min-width: 769px) and (max-width: 1180px)");
    for (const selector of [".topbar-main", ".topbar-title-stack", ".breadcrumbs.arco-breadcrumb", ".topbar-actions"]) {
      expect(styles).toContain(selector);
    }
    for (const rule of ["white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis", "min-width: 0"]) {
      expect(styles).toContain(rule);
    }
    expect(styles).toMatch(/@media \(min-width: 769px\) and \(max-width: 1180px\)[\s\S]*\.topbar-meta/);
    expect(styles).toMatch(/@media \(min-width: 769px\) and \(max-width: 1180px\)[\s\S]*\.topbar-product-tag/);
    expect(styles).toMatch(/@media \(min-width: 769px\) and \(max-width: 1180px\)[\s\S]*\.topbar-provider-status/);
    expect(styles).toMatch(/@media \(min-width: 769px\) and \(max-width: 1180px\)[\s\S]*\.topbar-user-avatar/);
  });

  it("新建识别上传区、表单和全局页面节奏使用 20-24px 间距", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const newRecognition = read("apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx");

    expect(newRecognition).toContain('className="recognition-form"');
    expect(newRecognition).toContain("recognition-upload-card");
    expect(newRecognition).toContain("recognition-config-card");
    expect(newRecognition).toContain("recognition-privacy-card");
    expect(newRecognition).toContain("recognition-actions-card");
    expect(newRecognition).toContain("recognition-form-grid");
    expect(styles).toMatch(/\.app-page,[\s\S]*\.dashboard-page\s*\{[\s\S]*gap:\s*var\(--space-6\)/);
    expect(styles).toMatch(/\.recognition-form\s*\{[\s\S]*gap:\s*var\(--space-6\)/);
    expect(styles).toMatch(/\.recognition-upload-card\s*\{[\s\S]*margin-bottom:\s*0/);
    expect(styles).toMatch(/\.recognition-config-card\s*\{[\s\S]*margin-top:\s*0/);
    expect(styles).toMatch(/\.recognition-form-grid\s*\{[\s\S]*margin-top:\s*0/);
    expect(styles).toMatch(/\.form-grid\s*\{[\s\S]*gap:\s*var\(--space-5\)/);
    expect(styles).toMatch(/\.dashboard-grid,[\s\S]*\.operations-split\s*\{[\s\S]*gap:\s*var\(--space-6\)/);
  });

  it("宽屏容器、dashboard grid 和指标卡片充分利用桌面空间但保留留白", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toContain("--page-max-width: 1600px");
    expect(styles).toMatch(/\.workspace-main\s*\{[\s\S]*max-width:\s*min\(calc\(100vw - 48px\),\s*var\(--page-max-width\)\)/);
    expect(styles).toMatch(/@media \(min-width: 1440px\)[\s\S]*--page-padding-x:\s*32px/);
    expect(styles).toMatch(/\.dashboard-grid,[\s\S]*\.detail-grid,[\s\S]*\.operations-split\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.25fr\) minmax\(360px,\s*0\.75fr\)/);
    expect(styles).toMatch(/\.metric-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/);
    expect(styles).toMatch(/\.metric-grid\.compact\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(200px,\s*1fr\)\)/);
    expect(styles).toMatch(/@media \(min-width: 1680px\)[\s\S]*--page-max-width:\s*1720px/);
    expect(styles).toMatch(/@media \(min-width: 1680px\)[\s\S]*\.workspace-main\s*\{[\s\S]*max-width:\s*min\(calc\(100vw - 64px\),\s*var\(--page-max-width\)\)/);
  });

  it("最近任务表格使用业务化 cell 层级，模板和 Provider 列不会像裸文本堆叠", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const dashboard = read("apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx");

    for (const className of [
      "recent-task-cell",
      "recent-task-cell__title",
      "recent-task-cell__meta",
      "recent-template-cell",
      "recent-provider-cell",
      "recent-owner-cell"
    ]) {
      expect(dashboard).toContain(className);
      expect(styles).toContain(`.${className}`);
    }

    expect(dashboard).toContain("width: 300");
    expect(dashboard).toContain("scroll={{ x: 1120 }}");
    expect(styles).toMatch(/\.recent-task-cell\s*\{[\s\S]*min-width:\s*260px/);
    expect(styles).toMatch(/\.recent-task-cell__title\s*\{[\s\S]*font-weight:\s*700/);
    expect(styles).toMatch(/\.recent-template-cell\s*\{[\s\S]*max-width:\s*220px/);
    expect(styles).toMatch(/\.recent-provider-cell\s*\{[\s\S]*font-family:\s*var\(--font-mono\)/);
    expect(styles).toMatch(/\.arco-table-td\s*\{[\s\S]*vertical-align:\s*middle/);
  });

  it("隐私选项是企业级设置项而不是原生 checkbox 堆叠", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const newRecognition = read("apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx");

    for (const className of [
      "privacy-option-list",
      "privacy-option",
      "privacy-option__checkbox",
      "privacy-option__icon",
      "privacy-option__body",
      "privacy-option__state"
    ]) {
      expect(newRecognition).toContain(className);
      expect(styles).toContain(`.${className}`);
    }

    expect(newRecognition).toContain("visiblePrivacyOptionContent");
    expect(newRecognition).toContain('onClick={() => updatePrivacy(key)}');
    expect(newRecognition).toContain("已启用");
    expect(newRecognition).toContain("未启用");
    expect(styles).toMatch(/\.privacy-option\s*\{[\s\S]*min-height:\s*72px/);
    expect(styles).toMatch(/\.privacy-option\s*\{[\s\S]*border:\s*1px solid var\(--color-border\)/);
    expect(styles).toMatch(/\.privacy-option\.is-checked\s*\{[\s\S]*background:\s*var\(--color-primary-soft\)/);
    expect(styles).toMatch(/\.privacy-option__checkbox\s*\{[\s\S]*min-width:\s*44px/);
    expect(styles).toMatch(/\.privacy-option__checkbox\s*\{[\s\S]*min-height:\s*44px/);
    expect(styles).toMatch(/\.privacy-option \.arco-checkbox\s*\{[\s\S]*margin-top:\s*2px/);
  });

  it("表格、卡片和按钮具备中台级 hover 与表头细节", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toContain("background: #FAFBFC");
    expect(styles).toMatch(/\.arco-table-tr:hover[\s\S]*background:\s*#F7F8FA/);
    expect(styles).toMatch(/\.panel:hover,[\s\S]*\.arco-card:hover\s*\{[\s\S]*box-shadow:\s*var\(--shadow-2\)/);
    expect(styles).toMatch(/\.arco-btn\s*\{[\s\S]*transition:/);
    expect(styles).toMatch(/\.metric-card__icon\s*\{[\s\S]*width:\s*40px/);
    expect(styles).toMatch(/\.metric-card__icon\s*\{[\s\S]*border:\s*1px solid rgba\(51,\s*112,\s*255,\s*0\.12\)/);
    expect(styles).toMatch(/\.metric-card::before\s*\{[\s\S]*background:\s*var\(--metric-accent,\s*var\(--color-primary\)\)/);
    expect(styles).toMatch(/\.arco-table-th\s*\{[\s\S]*font-size:\s*12px/);
    expect(styles).toMatch(/\.arco-table-td\s*\{[\s\S]*line-height:\s*20px/);
  });

  it("所有点名页面都有统一 app-page/业务页面容器，并使用 Arco/中台组件", () => {
    for (const file of pageFiles) {
      const content = read(file);
      expect(content, file).toMatch(/className="(?:app-page|login-screen)/);
      expect(content, file).toMatch(/<(Button|Card|Table|Form|Input|Select|Alert|Tag|Empty)\b/);
    }
  });

  it("登录页和核心页面不再只依赖裸 button/input/table/card 模板", () => {
    const login = read("apps/demo-web/src/pages/auth/LoginPage.tsx");
    const dashboard = read("apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx");
    const schema = read("apps/demo-web/src/pages/schema/SchemaStudioPage.tsx");
    const evaluation = read("apps/demo-web/src/pages/evaluation/EvaluationPage.tsx");

    for (const fileContent of [login, dashboard, schema, evaluation]) {
      expect(fileContent).toMatch(/<(Button|Card|Table|Form|Input|Select|Alert|Tag)\b/);
      expect(fileContent).not.toMatch(/<table className="data-table"/);
    }
    expect(login).not.toContain("<button");
    expect(login).not.toContain("<input");
  });
});

describe("mobile 响应式守护", () => {
  it("mobile 断点下侧栏转 Drawer，主内容单列且触摸控件不小于 44px", () => {
    const styles = read("apps/demo-web/src/styles.css");
    const shell = read("apps/demo-web/src/layouts/AppShell.tsx");

    expect(shell).toContain("Drawer");
    expect(styles).toContain("@media (max-width: 768px)");
    expect(styles).toContain("grid-template-columns: 1fr");
    expect(styles).toContain("min-height: 44px");
  });

  it("mobile topbar icon buttons keep a real 44px touch target", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.topbar-icon-button\.arco-btn\s*\{[\s\S]*width:\s*44px/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.topbar-icon-button\.arco-btn\s*\{[\s\S]*min-height:\s*44px/);
  });

  it("page headers and table surfaces prevent overflow without disabling horizontal table scroll", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toMatch(/\.page-header\s*\{[\s\S]*min-width:\s*0/);
    expect(styles).toMatch(/\.page-header\s*>\s*\*\s*\{[\s\S]*min-width:\s*0/);
    expect(styles).toMatch(/\.page-header__actions\s*\{[\s\S]*max-width:\s*100%/);
    expect(styles).toMatch(/\.table-scroll\s*\{[\s\S]*overflow-x:\s*auto/);
    expect(styles).toMatch(/\.arco-table \.arco-table-content-inner\s*\{[\s\S]*overflow-x:\s*auto/);
  });

  it("form controls and action rows can wrap on narrow screens without shrinking touch targets", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toMatch(/\.page-header__actions \.arco-input-inner-wrapper,[\s\S]*\.page-header__actions \.arco-select-view\s*\{[\s\S]*max-width:\s*100%/);
    expect(styles).toMatch(/\.row-actions \.arco-btn,[\s\S]*\.toolbar \.arco-btn\s*\{[\s\S]*min-height:\s*40px/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.row-actions \.arco-btn,[\s\S]*\.toolbar \.arco-btn\s*\{[\s\S]*min-height:\s*44px/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.arco-form-item-control-wrapper\s*\{[\s\S]*min-width:\s*0/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.page-header__actions\s*\{[\s\S]*overflow-x:\s*auto/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.inline-actions \.arco-btn\s*\{[\s\S]*min-height:\s*44px/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.table-scroll\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.page-header__actions \.arco-btn,[\s\S]*\.toolbar \.arco-btn\s*\{[\s\S]*flex:\s*1 1 152px/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.privacy-option\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*\.recent-task-cell\s*\{[\s\S]*min-width:\s*240px/);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.workspace-main\s*\{[\s\S]*padding:\s*var\(--space-4\)/);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.page-header__meta\s*\{[\s\S]*grid-template-columns:\s*1fr/);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.operations-status-strip\s*\{[\s\S]*grid-template-columns:\s*1fr/);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.metric-card\s*\{[\s\S]*min-height:\s*108px/);
  });

  it("desktop shell keeps the sidebar in the grid flow so it cannot cover main content", () => {
    const styles = read("apps/demo-web/src/styles.css");

    expect(styles).toMatch(/\.app-shell\s*\{[\s\S]*grid-template-columns:\s*260px minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.app-sidebar\s*\{[\s\S]*position:\s*sticky/);
    expect(styles).not.toMatch(/\.app-sidebar\s*\{[\s\S]*position:\s*fixed/);
    expect(styles).toMatch(/\.workspace\s*\{[\s\S]*min-width:\s*0/);
  });
});
