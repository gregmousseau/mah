import { test, expect } from '@playwright/test';

test('screenshot dashboard', async ({ page }) => {
  await page.goto('/');

  // Wait longer for page load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Take full page screenshot
  await page.screenshot({ path: 'qa-full-page.png', fullPage: true });

  // Check if Agent Config section exists
  const agentConfigExists = await page.locator('text=Agent Config').count();
  console.log(`Agent Config sections found: ${agentConfigExists}`);

  // Get page content
  const content = await page.content();
  console.log('Page title:', await page.title());
  console.log('URL:', page.url());

  // Look for agents data
  const hasAgents = await page.locator('text=Frankie').count();
  console.log(`Frankie found: ${hasAgents} times`);
});
