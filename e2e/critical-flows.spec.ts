import { test, expect, type Page } from '@playwright/test';

/**
 * 登录辅助函数：使用 seed 数据库中的管理员凭据登录
 * 注意：Arco Design Input 组件需要 click + fill 来触发 onChange
 */
async function login(page: Page) {
  await page.goto('/login');
  // 等待登录表单加载
  await page.waitForSelector('text=登录临床工作台', { timeout: 10000 });

  // 清空并填写邮箱（Arco Input 组件）
  const emailInput = page.locator('input[name="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 5000 });
  await emailInput.click({ clickCount: 3 }); // 选中全部
  await emailInput.fill('admin.dev@example.local');

  // 清空并填写密码（Arco Input.Password 组件）
  const passwordInput = page.locator('input[name="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.click({ clickCount: 3 }); // 选中全部
  await passwordInput.fill('ChangeMe123!');

  // 点击登录按钮
  const submitButton = page.locator('button[type="submit"]').first();
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  // 等待离开登录页（使用 waitForFunction 更可靠）
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    { timeout: 15000 }
  );
}

test.describe('核心业务流程 E2E', () => {
  test('登录流程：输入凭据后成功跳转', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=登录临床工作台')).toBeVisible();
    await login(page);
    expect(page.url()).not.toContain('/login');
  });

  test('首页加载：登录后可见看板内容', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(10);
  });

  test('Provider 设置页面加载', async ({ page }) => {
    await login(page);
    await page.goto('/providers');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('Schema Studio 页面加载', async ({ page }) => {
    await login(page);
    await page.goto('/schema');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('移动端视图：375x667 下页面可访问', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    try {
      await login(page);
      await page.goto('/');
      await expect(page.locator('body')).toBeVisible();
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(10);
    } finally {
      await context.close();
    }
  });
});
