import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto('http://localhost:3333/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scroll to Agent Management section
    const agentSection = page.locator('h2:has-text("Agent Management")').locator('..').locator('..');
    await agentSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    // Find a agent card - look for cards with background #0d0d18
    const cards = page.locator('[style*="background: #0d0d18"]').filter({
      has: page.locator('text=Frankie')
    });

    console.log(`Found ${await cards.count()} Frankie card(s)`);

    // Click the first card
    const firstCard = cards.first();
    console.log('Clicking Frankie card...');
    await firstCard.click({ force: true });
    await page.waitForTimeout(1000);

    // Look for expanded content - workspace should be visible
    const workspaceLabels = await page.locator('text=WORKSPACE').count();
    console.log(`WORKSPACE labels found after click: ${workspaceLabels}`);

    if (workspaceLabels > 0) {
      console.log('✓ Card expanded successfully!');

      // Click again to collapse
      await firstCard.click({ force: true });
      await page.waitForTimeout(1000);

      const workspaceAfterCollapse = await page.locator('text=WORKSPACE').count();
      console.log(`WORKSPACE labels after collapse: ${workspaceAfterCollapse}`);

      if (workspaceAfterCollapse < workspaceLabels) {
        console.log('✓ Card collapsed successfully!');
      } else {
        console.log('❌ Card did not collapse');
      }
    } else {
      console.log('❌ Card did not expand');

      // Take a screenshot to debug
      await page.screenshot({ path: 'expand-test-fail.png', fullPage: true });
      console.log('Screenshot saved to expand-test-fail.png');
    }

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'expand-test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
