import { chromium } from '@playwright/test';

async function takeScreenshot() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3333');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Scroll to Agent Config and click Add Agent
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.includes('Agent Config'));
    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Add Agent")').click();
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: '/tmp/agent-config-modal.png', fullPage: false });
  console.log('Modal screenshot saved');
  
  await browser.close();
}

takeScreenshot();
