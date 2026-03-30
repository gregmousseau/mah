import { chromium } from '@playwright/test';

async function manualCheck() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  console.log('📋 QA Manual Check - Agent Config UI\n');

  try {
    await page.goto('http://localhost:3333');
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Wait for agents to load
    await page.waitForTimeout(3000);

    // Check 1: Section exists
    const sectionTitle = await page.locator('text=Agent Config').first().isVisible();
    console.log(`✓ Agent Config section visible: ${sectionTitle}`);

    // Check 2: Count agent cards by looking for agent names
    const agents = ['Frankie', 'Devin', 'Quinn', 'Reese', 'Connie'];
    const foundAgents = [];
    for (const agent of agents) {
      const visible = await page.locator(`text=${agent}`).first().isVisible().catch(() => false);
      if (visible) foundAgents.push(agent);
    }
    console.log(`✓ Agent cards found: ${foundAgents.length}/5 - ${foundAgents.join(', ')}`);

    // Check 3: Add Agent button
    const addButton = await page.locator('button:has-text("Add Agent")').isVisible();
    console.log(`✓ Add Agent button visible: ${addButton}`);

    // Check 4: Click Add Agent and check modal
    if (addButton) {
      await page.locator('button:has-text("Add Agent")').click();
      await page.waitForTimeout(500);
      const modal = await page.locator('text=Add New Agent').isVisible();
      console.log(`✓ Add Agent modal opens: ${modal}`);

      // Check 5: Form validation
      const nameInput = await page.locator('input[placeholder*="Alex"]').isVisible();
      const descInput = await page.locator('textarea[placeholder*="What does this agent do?"]').isVisible();
      const platformSelect = await page.locator('select').isVisible();
      console.log(`✓ Form fields present: name=${nameInput}, desc=${descInput}, platform=${platformSelect}`);

      // Check 6: Validation blocks submission
      await page.locator('input[placeholder*="Alex"]').clear();
      await page.locator('textarea[placeholder*="What does this agent do?"]').clear();
      await page.locator('button:has-text("Create Agent")').click();
      await page.waitForTimeout(300);
      const stillVisible = await page.locator('text=Add New Agent').isVisible();
      console.log(`✓ Validation blocks empty submission: ${stillVisible}`);

      // Close modal by clicking backdrop
      await page.mouse.click(50, 50); // Click outside modal
      await page.waitForTimeout(500);
    }

    // Check 7: Expand/collapse
    const frankieCard = page.locator('text=Frankie').first();
    await frankieCard.click();
    await page.waitForTimeout(500);
    const expanded = await page.locator('text=WORKSPACE').first().isVisible().catch(() => false);
    console.log(`✓ Card expand works: ${expanded}`);

    // Check 8: Quinn evaluator badge
    const evaluatorBadge = await page.locator('text=QA').first().isVisible().catch(() => false);
    console.log(`✓ Quinn evaluator badge visible: ${evaluatorBadge}`);

    // Check 9: Platform badges
    const platformBadges = await page.locator('[style*="textTransform: uppercase"]').filter({ hasText: /OPENCLAW|CLAUDE-CODE|CODEX/ }).count();
    console.log(`✓ Platform badges found: ${platformBadges}`);

    // Check 10: Theme colors
    const section = page.locator('text=Agent Management').first().locator('..').locator('..');
    const bgColor = await section.evaluate((el) => window.getComputedStyle(el).backgroundColor).catch(() => null);
    console.log(`✓ Section background color: ${bgColor}`);

    console.log('\n✅ Manual QA check complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

manualCheck();
