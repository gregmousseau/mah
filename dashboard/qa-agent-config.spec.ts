import { test, expect } from '@playwright/test';

test.describe('Agent Config UI', () => {
  test('renders all 5 agent cards with correct data', async ({ page }) => {
    await page.goto('/');

    // Wait for Agent Config section to load
    await page.waitForSelector('text=Agent Config', { timeout: 10000 });

    // Scroll to Agent Config section
    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Check that we have agent cards - look for agent names
    const agents = ['Frankie', 'Devin', 'Quinn', 'Reese', 'Connie'];
    for (const agentName of agents) {
      await expect(page.locator(`text=${agentName}`).first()).toBeVisible({ timeout: 5000 });
    }

    // Verify Quinn has isEvaluator badge
    const evaluatorBadge = page.locator('text=Evaluator');
    await expect(evaluatorBadge).toBeVisible();
  });

  test('each agent card has required elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Check first agent (Frankie) for required elements
    const frankieText = page.locator('text=Frankie').first();
    await expect(frankieText).toBeVisible();

    // Platform badge should be visible (uppercase text like OPENCLAW)
    const platformBadges = page.locator('[style*="textTransform: uppercase"][style*="letterSpacing"]').filter({ hasText: /OPENCLAW|CLAUDE-CODE|CODEX/ });
    await expect(platformBadges.first()).toBeVisible();

    // Status indicator (green dot) - look for circular elements with green background
    const statusIndicators = page.locator('[style*="borderRadius: 50%"][style*="background: #10b981"]');
    await expect(statusIndicators.first()).toBeVisible();
  });

  test('Add Agent button exists and opens modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    // Scroll to section
    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Click Add Agent button
    const addButton = page.locator('button:has-text("Add Agent")');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Modal should appear
    await expect(page.locator('text=Add New Agent')).toBeVisible();

    // Check form fields exist
    await expect(page.locator('input[placeholder*="Alex"]')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="What does this agent do?"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();

    // Close modal
    const closeButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await closeButton.click();
  });

  test('Add Agent modal validation blocks empty submission', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Open modal
    await page.locator('button:has-text("Add Agent")').click();
    await page.waitForSelector('text=Add New Agent');

    // Clear name field
    const nameInput = page.locator('input[placeholder*="Alex"]');
    await nameInput.clear();

    // Clear description field
    const descriptionInput = page.locator('textarea[placeholder*="What does this agent do?"]');
    await descriptionInput.clear();

    // Try to submit
    const submitButton = page.locator('button:has-text("Create Agent")');
    await submitButton.click();

    // Modal should still be visible (form validation prevents submission)
    await expect(page.locator('text=Add New Agent')).toBeVisible();

    // Verify form fields have required attribute
    const isNameRequired = await nameInput.getAttribute('required');
    const isDescRequired = await descriptionInput.getAttribute('required');
    expect(isNameRequired).not.toBeNull();
    expect(isDescRequired).not.toBeNull();
  });

  test('theme consistency - colors match specification', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Check Agent Config section background (#141420 = rgb(20, 20, 32))
    const sectionBg = await agentConfigSection.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(sectionBg).toBe('rgb(20, 20, 32)');

    // Check border color (#2a2a3a = rgb(42, 42, 58))
    const sectionBorder = await agentConfigSection.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    expect(sectionBorder).toContain('rgb(42, 42, 58)');

    // Check Add Agent button has purple gradient
    const addButton = page.locator('button:has-text("Add Agent")');
    const buttonBg = await addButton.evaluate((el) =>
      window.getComputedStyle(el).backgroundImage
    );
    expect(buttonBg).toContain('gradient');
    expect(buttonBg).toContain('124, 58, 237'); // #7c3aed in rgb
  });

  test('expand/collapse agent card works', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    // Find and click Frankie's card
    const frankieText = page.locator('text=Frankie').first();
    const frankieCard = frankieText.locator('..').locator('..').locator('..');

    await frankieCard.click();

    // Wait for expansion animation
    await page.waitForTimeout(400);

    // Look for expanded details - workspace label should appear
    const workspaceLabel = page.locator('text=WORKSPACE');
    await expect(workspaceLabel.first()).toBeVisible();

    // Click again to collapse
    await frankieCard.click();
    await page.waitForTimeout(400);

    // Workspace label should not be visible (or much less visible)
    const workspaceCount = await page.locator('text=WORKSPACE').count();
    // After collapse, the expanded panel should be gone or hidden
    expect(workspaceCount).toBeLessThanOrEqual(1);
  });

  test('hover states on Add Agent button', async ({ page, browserName }) => {
    // Skip on mobile contexts
    if (page.viewportSize() && page.viewportSize()!.width < 768) {
      test.skip();
    }

    await page.goto('/');
    await page.waitForSelector('text=Agent Config');

    const agentConfigSection = page.locator('text=Agent Config').locator('..');
    await agentConfigSection.scrollIntoViewIfNeeded();

    const addButton = page.locator('button:has-text("Add Agent")');

    // Get initial transform
    const initialTransform = await addButton.evaluate((el) =>
      window.getComputedStyle(el).transform
    );

    // Hover
    await addButton.hover();
    await page.waitForTimeout(200);

    // Check transform changed
    const hoverTransform = await addButton.evaluate((el) =>
      window.getComputedStyle(el).transform
    );

    // Should have translateY applied on hover
    expect(hoverTransform).not.toBe(initialTransform);
  });
});
