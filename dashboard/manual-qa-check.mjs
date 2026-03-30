import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    console.log('Loading page...');
    await page.goto('http://localhost:3333/', { waitUntil: 'networkidle' });

    console.log('Page title:', await page.title());

    // Wait for content to load
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: 'qa-dashboard.png', fullPage: true });
    console.log('Screenshot saved to qa-dashboard.png');

    // Check for Agent Config/Management section
    const agentConfigCount = await page.locator('text=Agent Config').count();
    const agentManagementCount = await page.locator('text=Agent Management').count();
    console.log(`\nAgent Config sections found: ${agentConfigCount}`);
    console.log(`Agent Management sections found: ${agentManagementCount}`);

    if (agentConfigCount === 0 && agentManagementCount === 0) {
      console.log('\n❌ CRITICAL: Agent Config/Management section not found on page!');
      const bodyText = await page.textContent('body');
      console.log('\nPage content (first 500 chars):', bodyText.substring(0, 500));
    } else {
      // Check for all 5 agents
      const agents = ['Frankie', 'Devin', 'Quinn', 'Reese', 'Connie'];
      console.log('\n--- Agent Cards Check ---');
      for (const agent of agents) {
        const count = await page.locator(`text=${agent}`).count();
        console.log(`${count > 0 ? '✓' : '❌'} ${agent}: found ${count} time(s)`);
      }

      // Check for isEvaluator badge on Quinn
      const evaluatorBadge = await page.locator('text=Evaluator').count();
      console.log(`${evaluatorBadge > 0 ? '✓' : '❌'} Quinn Evaluator badge: ${evaluatorBadge > 0 ? 'found' : 'NOT FOUND'}`);

      // Check for Add Agent button
      const addButton = await page.locator('button:has-text("Add Agent")').count();
      console.log(`${addButton > 0 ? '✓' : '❌'} Add Agent button: ${addButton > 0 ? 'found' : 'NOT FOUND'}`);

      // Test Add Agent modal
      if (addButton > 0) {
        console.log('\n--- Testing Add Agent Modal ---');
        await page.locator('button:has-text("Add Agent")').click();
        await page.waitForTimeout(500);

        const modalVisible = await page.locator('text=Add New Agent').isVisible();
        console.log(`${modalVisible ? '✓' : '❌'} Modal opens: ${modalVisible ? 'YES' : 'NO'}`);

        if (modalVisible) {
          const nameInput = page.locator('input[placeholder*="Alex"]');
          const descInput = page.locator('textarea[placeholder*="What does this agent do?"]');

          const nameRequired = await nameInput.getAttribute('required');
          const descRequired = await descInput.getAttribute('required');

          console.log(`${nameRequired !== null ? '✓' : '❌'} Name field has required attribute: ${nameRequired !== null ? 'YES' : 'NO'}`);
          console.log(`${descRequired !== null ? '✓' : '❌'} Description field has required attribute: ${descRequired !== null ? 'YES' : 'NO'}`);

          // Test validation
          await nameInput.clear();
          await descInput.clear();

          await page.locator('button:has-text("Create Agent")').click();
          await page.waitForTimeout(500);

          const stillVisible = await page.locator('text=Add New Agent').isVisible();
          console.log(`${stillVisible ? '✓' : '❌'} Validation blocks submission: ${stillVisible ? 'YES' : 'NO'}`);

          // Close modal by clicking backdrop
          await page.click('body', { position: { x: 10, y: 10 } });
          await page.waitForTimeout(500);

          // Verify modal is closed
          const modalClosed = !(await page.locator('text=Add New Agent').isVisible().catch(() => false));
          console.log(`Modal closed: ${modalClosed ? 'YES' : 'NO'}`);
        }
      }

      // Check theme colors - target the specific section that contains the agent cards
      console.log('\n--- Theme Consistency Check ---');
      const agentConfigSection = page.locator('h2:has-text("Agent Management")').locator('..').locator('..');
      const bgColor = await agentConfigSection.evaluate(el => window.getComputedStyle(el).backgroundColor);
      const borderColor = await agentConfigSection.evaluate(el => window.getComputedStyle(el).borderColor);

      console.log(`Background: ${bgColor} ${bgColor === 'rgb(20, 20, 32)' ? '✓' : '❌ (expected rgb(20, 20, 32))'}`);
      console.log(`Border: ${borderColor} ${borderColor.includes('rgb(42, 42, 58)') ? '✓' : '❌ (expected rgb(42, 42, 58))'}`);

      const addButtonBg = await page.locator('button:has-text("Add Agent")').evaluate(el =>
        window.getComputedStyle(el).backgroundImage
      );
      console.log(`Add Agent button gradient: ${addButtonBg.includes('gradient') && addButtonBg.includes('124, 58, 237') ? '✓' : '❌'}`);

      // Test expand/collapse
      console.log('\n--- Expand/Collapse Test ---');
      // Scroll to Frankie to ensure it's in viewport
      const frankieCard = page.locator('text=Frankie').locator('..').locator('..').locator('..').first();
      await frankieCard.scrollIntoViewIfNeeded();
      await frankieCard.click();
      await page.waitForTimeout(400);

      const workspaceVisible = await page.locator('text=WORKSPACE').isVisible().catch(() => false);
      console.log(`${workspaceVisible ? '✓' : '❌'} Card expands: ${workspaceVisible ? 'YES' : 'NO'}`);

      if (workspaceVisible) {
        await frankieCard.click();
        await page.waitForTimeout(400);

        const workspaceCount = await page.locator('text=WORKSPACE').count();
        console.log(`${workspaceCount === 0 ? '✓' : '❌'} Card collapses: ${workspaceCount === 0 ? 'YES' : 'NO'}`);
      }
    }

  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    await browser.close();
  }
})();
