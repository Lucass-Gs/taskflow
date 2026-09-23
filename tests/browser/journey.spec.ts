import { test, expect } from "@playwright/test";
test("complete user journey and responsive layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "Demo1234!");
  await page.getByRole("button", { name: "Entrar", exact: false }).click();
  await expect(page.locator("header")).toBeVisible();
  await page.getByRole("button", { name: "+ Nova tarefa" }).click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Browser task " + Date.now());
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Teste E2E de tarefa.");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const task = page
    .locator(".task")
    .filter({ hasText: "Teste E2E de tarefa." })
    .first();
  await expect(task).toBeVisible();
  await task.locator("select").selectOption("doing");
  await expect(task.locator("select")).toHaveValue("doing");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 1440)
      await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
  }
  expect(errors).toEqual([]);
});
