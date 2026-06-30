import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import OfflineStatusBanner from '../OfflineStatusBanner';

// Mock the hooks
const mockAddToast = vi.fn();
const mockResetWasOffline = vi.fn();

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

// Mock the shared offline retry queue so we can drive the queued count and
// assert that the banner flushes the queue on reconnect.
let queueListener: ((count: number) => void) | undefined;
let initialQueueCount = 0;
const processQueueMock = vi.fn();

vi.mock('@/lib/networkQueue', () => ({
  subscribeToQueue: (fn: (count: number) => void) => {
    queueListener = fn;
    fn(initialQueueCount);
    return () => {
      queueListener = undefined;
    };
  },
  processQueue: () => processQueueMock(),
}));

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineStatusToastSchema } from '@/lib/offlineStatusSchema';

// Push a new queue depth to the subscribed banner.
function emitQueueCount(count: number) {
  act(() => {
    queueListener?.(count);
  });
}

function setOnlineStatus(value: { isOnline: boolean; wasOffline: boolean }) {
  (useOnlineStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...value,
    resetWasOffline: mockResetWasOffline,
  });
}

describe('OfflineStatusBanner', () => {
  beforeEach(() => {
    queueListener = undefined;
    initialQueueCount = 0;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when online', async () => {
    setOnlineStatus({ isOnline: true, wasOffline: false });

    render(<OfflineStatusBanner />);

    // Wait past the 300ms loading skeleton, then confirm no status banner.
    await waitFor(() => {
      expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders banner when offline', async () => {
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);

    const banner = await screen.findByRole('status');
    expect(banner).toBeDefined();
    expect(screen.getByText(/You are offline/i)).toBeDefined();
  });

  it('uses CSS variable tokens for colour — no raw Tailwind colour classes', async () => {
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);
    await screen.findByRole('status');

    const html = document.body.innerHTML;
    expect(html).not.toMatch(/\bbg-red-\d+\b/);
    expect(html).not.toMatch(/\btext-red-\d+\b/);
    expect(html).not.toMatch(/\bborder-red-\d+\b/);
  });

  it('marks decorative icons as aria-hidden', async () => {
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);
    await screen.findByRole('status');

    const hiddenContainers = document.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenContainers.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes an accessible label on the banner region', async () => {
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);

    expect(await screen.findByLabelText(/offline status/i)).toBeDefined();
  });

  it('shows success toast when coming back online', async () => {
    setOnlineStatus({ isOnline: true, wasOffline: true });

    render(<OfflineStatusBanner />);

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('restored'),
          severity: 'success',
        }),
      );
    });
    expect(mockResetWasOffline).toHaveBeenCalled();
  });

  it('falls back to default message when toast validation fails', async () => {
    const safeParseSpy = vi
      .spyOn(offlineStatusToastSchema, 'safeParse')
      .mockReturnValue({
        success: false,
        error: {
          issues: [{ message: 'Validation failed' }],
          format: () => ({}),
        },
      } as never);

    setOnlineStatus({ isOnline: true, wasOffline: true });

    render(<OfflineStatusBanner />);

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Validation failed');
    });

    safeParseSpy.mockRestore();
  });
});

describe('OfflineStatusBanner — offline retry queue', () => {
  beforeEach(() => {
    queueListener = undefined;
    initialQueueCount = 0;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reports the number of queued actions while offline (plural)', async () => {
    initialQueueCount = 3;
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);
    await screen.findByRole('status');

    expect(screen.getByText(/3 actions queued/i)).toBeDefined();
  });

  it('uses singular wording for a single queued action', async () => {
    initialQueueCount = 1;
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);
    await screen.findByRole('status');

    expect(screen.getByText(/1 action queued/i)).toBeDefined();
  });

  it('does not show a queued-count line when the queue is empty', async () => {
    initialQueueCount = 0;
    setOnlineStatus({ isOnline: false, wasOffline: false });

    render(<OfflineStatusBanner />);
    await screen.findByRole('status');

    expect(screen.queryByText(/queued/i)).toBeNull();
  });

  it('flushes the queue and shows a reconnecting banner when back online with pending actions', async () => {
    initialQueueCount = 2;
    setOnlineStatus({ isOnline: true, wasOffline: true });

    render(<OfflineStatusBanner />);

    await waitFor(() => {
      expect(processQueueMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Replaying 2 queued actions/i),
    ).toBeDefined();
    expect(screen.getByLabelText(/reconnecting status/i)).toBeDefined();
  });

  it('does not flush the queue on reconnect when nothing is pending', async () => {
    initialQueueCount = 0;
    setOnlineStatus({ isOnline: true, wasOffline: true });

    render(<OfflineStatusBanner />);

    await waitFor(() => {
      expect(mockResetWasOffline).toHaveBeenCalled();
    });
    expect(processQueueMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears the reconnecting banner once the queue drains', async () => {
    initialQueueCount = 2;
    setOnlineStatus({ isOnline: true, wasOffline: true });

    render(<OfflineStatusBanner />);

    expect(
      await screen.findByText(/Replaying 2 queued actions/i),
    ).toBeDefined();

    // Queue drains to zero.
    emitQueueCount(0);

    await waitFor(() => {
      expect(screen.queryByText(/Replaying/i)).toBeNull();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
