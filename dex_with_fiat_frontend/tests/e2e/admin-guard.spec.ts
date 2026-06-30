import { test, expect, Page } from '@playwright/test';

/**
 * E2E coverage for AdminGuard.tsx — the on-chain admin route guard.
 *
 * AdminGuard fetches the authorized admin address from the Soroban contract and
 * only renders its children when the connected wallet matches. These tests
 * exercise the critical paths that do not depend on a funded testnet account or
 * a real admin match:
 *   1. Unauthenticated visitors are redirected to the landing page.
 *   2. The offline retry queue parks the check while offline and replays it on
 *      reconnect.
 *   3. A failing on-chain lookup surfaces the recoverable error UI.
 */

const ADMIN_ROUTE = '/admin';

// 56-char, G-prefixed value that satisfies AdminGuard's Zod address schema.
const VALID_WALLET_ADDRESS = `G${'A'.repeat(55)}`;

// Soroban RPC endpoints AdminGuard's getAdmin() helper talks to.
const SOROBAN_RPC_GLOB = '**/soroban-testnet.stellar.org/**';

/** Drive the test-only wallet connect hook exposed on window. */
async function connectWallet(page: Page, address: string): Promise<void> {
  await page.evaluate((addr) => {
    (
      window as { mockStellarConnect?: (address: string) => void }
    ).mockStellarConnect?.(addr);
  }, address);
}

test.describe('AdminGuard', () => {
  test('redirects unauthenticated visitors to the landing page', async ({
    page,
  }) => {
    await page.goto(ADMIN_ROUTE);

    // The guard reports no wallet, so it renders the public landing page…
    await expect(page.locator('#landing-hero-heading')).toBeVisible({
      timeout: 15_000,
    });

    // …and never the protected admin dashboard.
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }),
    ).toHaveCount(0);
  });

  test('queues the admin check while offline and retries on reconnect', async ({
    page,
    context,
  }) => {
    // Fail any on-chain lookup fast so the reconnect path resolves
    // deterministically instead of hitting the live network.
    await page.route(SOROBAN_RPC_GLOB, (route) => route.abort());

    await page.goto(ADMIN_ROUTE);
    await expect(page.locator('#landing-hero-heading')).toBeVisible({
      timeout: 15_000,
    });

    // Drop the connection, then connect a wallet so the guard re-runs its check
    // while the browser is offline.
    await context.setOffline(true);
    await connectWallet(page, VALID_WALLET_ADDRESS);

    // The guard parks the verification and shows its offline retry screen…
    await expect(
      page.getByText(/Admin verification will retry automatically/i),
    ).toBeVisible({ timeout: 15_000 });
    // …without leaking the protected dashboard.
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' }),
    ).toHaveCount(0);

    // Coming back online flushes the queued check and clears the offline screen.
    await context.setOffline(false);
    await expect(
      page.getByText(/Admin verification will retry automatically/i),
    ).toBeHidden({ timeout: 15_000 });
  });

  test('shows a recoverable error when the on-chain admin lookup fails', async ({
    page,
  }) => {
    // Force getAdmin()'s Soroban simulation to fail.
    await page.route(SOROBAN_RPC_GLOB, (route) => route.abort());

    await page.goto(ADMIN_ROUTE);
    await expect(page.locator('#landing-hero-heading')).toBeVisible({
      timeout: 15_000,
    });

    // A valid, connected wallet passes address validation but the contract
    // lookup throws, so the guard renders its error recovery UI.
    await connectWallet(page, VALID_WALLET_ADDRESS);

    await expect(
      page.getByText(/Failed to verify admin status\. Please try again\./i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /try again/i }),
    ).toBeVisible();
  });
});
