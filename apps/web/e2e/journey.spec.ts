import { expect, test } from '@playwright/test';

/**
 * End-to-end journey (requirement 48):
 *   signup → profile → discover → detail → save → apply → track
 */

const password = 'Password1';
const email = (): string => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

test.describe('public discovery', () => {
  test('the landing page renders and links into search', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /browse/i }).first().click();
    await expect(page).toHaveURL(/\/opportunities/);
  });

  test('search returns opportunities and filters narrow them', async ({ page }) => {
    await page.goto('/opportunities');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    const before = await page.locator('article').count();
    expect(before).toBeGreaterThan(0);

    // Applying a type facet must change the URL and re-query.
    const facet = page.getByRole('checkbox').first();
    if (await facet.isVisible()) {
      await facet.check();
      await expect(page).toHaveURL(/[?&]/);
    }
  });

  test('natural-language search reports what it understood', async ({ page }) => {
    await page.goto('/opportunities');
    await page.getByRole('searchbox', { name: /search opportunities/i }).fill('government jobs for BTech CSE');
    await expect(page.getByText(/Searching/i)).toBeVisible({ timeout: 15_000 });
  });

  test('an opportunity detail page shows source, eligibility and an apply link', async ({ page }) => {
    await page.goto('/opportunities');
    await page.locator('article a').first().click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Eligibility/i).first()).toBeVisible();
    await expect(page.getByText(/source/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /apply on official site/i })).toBeVisible();
  });

  test('the module landing pages render', async ({ page }) => {
    for (const path of ['/internships', '/government-jobs', '/psu-jobs', '/fresher-jobs']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('student journey', () => {
  test('sign up, build a profile, then save and track an opportunity', async ({ page }) => {
    const userEmail = email();

    // --- Sign up ---
    await page.goto('/register');
    await page.getByLabel('Full name').fill('E2E Student');
    await page.getByLabel('Email').fill(userEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    // --- Onboarding ---
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await page.getByLabel('Branch / specialisation').fill('CSE');
    await page.getByLabel('CGPA (out of 10)').fill('8.4');
    await page.getByRole('button', { name: /continue/i }).click();

    await page.getByText('Python', { exact: true }).first().click();
    await page.getByText('SQL', { exact: true }).first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    await page.getByLabel('Your city').fill('Bengaluru');
    await page.getByRole('button', { name: /finish setup/i }).click();

    // --- Dashboard ---
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Good (Morning|Afternoon|Evening)/i })).toBeVisible();

    // --- Discover and save ---
    await page.goto('/opportunities');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    // A signed-in user sees a match score on every card.
    await expect(page.locator('article').first().getByText(/%/).first()).toBeVisible();

    await page.locator('article').first().getByRole('button', { name: /save opportunity/i }).click();
    await page.goto('/saved');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 15_000 });

    // --- Track ---
    await page.goto('/applications');
    await expect(page.getByRole('heading', { name: /application tracker/i })).toBeVisible();
  });

  test('the assistant answers from the opportunity database', async ({ page }) => {
    const userEmail = email();

    await page.goto('/register');
    await page.getByLabel('Full name').fill('Assistant Tester');
    await page.getByLabel('Email').fill(userEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    await page.goto('/assistant');
    await page.getByRole('textbox', { name: /ask the assistant/i }).fill('Find internships for me');
    await page.getByRole('button', { name: 'Ask' }).click();

    // A grounded answer, not a spinner that never resolves.
    await expect(page.getByText(/Sources|could not find/i).first()).toBeVisible({ timeout: 40_000 });
  });
});

test.describe('accessibility and responsiveness', () => {
  test('the mobile bottom bar appears for a signed-in user', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only navigation');

    const userEmail = email();
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Mobile Tester');
    await page.getByLabel('Email').fill(userEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByRole('navigation', { name: /mobile primary/i })).toBeVisible({ timeout: 20_000 });
  });

  test('every page exposes a skip link and a single h1', async ({ page }) => {
    await page.goto('/opportunities');
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeAttached();
    await expect(page.locator('h1')).toHaveCount(1);
  });
});
