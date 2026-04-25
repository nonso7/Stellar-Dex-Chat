import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CCIPBridgeModal from '../CCIPBridgeModal';

vi.mock('@/hooks/useAccessibleModal', () => ({
  useAccessibleModal: () => undefined,
}));

describe('CCIPBridgeModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onStartTransfer: vi.fn().mockResolvedValue({
      transactionHash: '0xabc123',
    }),
    fetchTransferStatus: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows a polling spinner and message while waiting for confirmation', async () => {
    const fetchTransferStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'PENDING' });

    render(
      <CCIPBridgeModal
        {...defaultProps}
        fetchTransferStatus={fetchTransferStatus}
      />,
    );

    fireEvent.click(screen.getByText('Start CCIP Transfer'));

    expect(
      await screen.findByText('Waiting for CCIP confirmation…'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ccip-polling-spinner')).toBeInTheDocument();
    expect(fetchTransferStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    await waitFor(() => {
      expect(fetchTransferStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a green checkmark when the explorer reports SUCCESS', async () => {
    const fetchTransferStatus = vi.fn().mockResolvedValue({
      status: 'SUCCESS',
      explorerUrl: 'https://ccip.chain.link/status?search=0xabc123',
    });

    render(
      <CCIPBridgeModal
        {...defaultProps}
        fetchTransferStatus={fetchTransferStatus}
      />,
    );

    fireEvent.click(screen.getByText('Start CCIP Transfer'));

    expect(
      await screen.findByText('CCIP transfer confirmed'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ccip-success-icon')).toBeInTheDocument();
    expect(screen.getByText('Status: SUCCESS')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view transaction in ccip explorer/i }),
    ).toHaveAttribute(
      'href',
      'https://ccip.chain.link/status?search=0xabc123',
    );
  });

  it('times out after 10 minutes and shows an error state', async () => {
    const fetchTransferStatus = vi.fn().mockResolvedValue({ status: 'PENDING' });

    render(
      <CCIPBridgeModal
        {...defaultProps}
        fetchTransferStatus={fetchTransferStatus}
      />,
    );

    fireEvent.click(screen.getByText('Start CCIP Transfer'));

    expect(
      await screen.findByText('Waiting for CCIP confirmation…'),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(
      await screen.findByText('CCIP transfer error'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/timed out after 10 minutes/i),
    ).toBeInTheDocument();
  });

  // ── Optimistic UI tests for issue #536 ────────────────────────────────

  describe('Optimistic UI updates (issue #536)', () => {
    it('immediately shows PENDING status when transfer is initiated', async () => {
      const onStartTransfer = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ transactionHash: '0xabc123' }),
              100,
            ),
          ),
      );

      render(
        <CCIPBridgeModal
          {...defaultProps}
          onStartTransfer={onStartTransfer}
          fetchTransferStatus={vi.fn().mockResolvedValue({ status: 'PENDING' })}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Should show initiating state immediately
      expect(
        await screen.findByText('Starting CCIP transfer…'),
      ).toBeInTheDocument();

      // Wait for the transfer to complete
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should transition to polling with PENDING status
      expect(
        await screen.findByText('Waiting for CCIP confirmation…'),
      ).toBeInTheDocument();
      expect(screen.getByText('Latest status: PENDING')).toBeInTheDocument();
    });

    it('immediately transitions to polling state after successful transfer initiation', async () => {
      const onStartTransfer = vi.fn().mockResolvedValue({
        transactionHash: '0xabc123',
        explorerUrl: 'https://ccip.chain.link/status?search=0xabc123',
      });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          onStartTransfer={onStartTransfer}
          fetchTransferStatus={vi.fn().mockResolvedValue({ status: 'PENDING' })}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Should immediately show polling state with explorer link
      expect(
        await screen.findByText('Waiting for CCIP confirmation…'),
      ).toBeInTheDocument();
      
      const explorerLink = screen.getByRole('link', {
        name: /view transaction in ccip explorer/i,
      });
      expect(explorerLink).toHaveAttribute(
        'href',
        'https://ccip.chain.link/status?search=0xabc123',
      );
    });

    it('immediately updates status when polling receives new status', async () => {
      const fetchTransferStatus = vi
        .fn()
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce({ status: 'IN_PROGRESS' })
        .mockResolvedValueOnce({ status: 'SUCCESS' });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          fetchTransferStatus={fetchTransferStatus}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Initial PENDING status
      expect(
        await screen.findByText('Latest status: PENDING'),
      ).toBeInTheDocument();

      // Advance to next poll
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      // Should immediately show IN_PROGRESS
      expect(
        await screen.findByText('Latest status: IN_PROGRESS'),
      ).toBeInTheDocument();

      // Advance to final poll
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      // Should immediately transition to success
      expect(
        await screen.findByText('CCIP transfer confirmed'),
      ).toBeInTheDocument();
    });

    it('immediately transitions to success state when SUCCESS status is received', async () => {
      const fetchTransferStatus = vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        explorerUrl: 'https://ccip.chain.link/status?search=0xabc123',
      });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          fetchTransferStatus={fetchTransferStatus}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Should immediately transition to success
      expect(
        await screen.findByText('CCIP transfer confirmed'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('ccip-success-icon')).toBeInTheDocument();
    });

    it('immediately transitions to error state when FAILED status is received', async () => {
      const fetchTransferStatus = vi.fn().mockResolvedValue({
        status: 'FAILED',
        errorMessage: 'Insufficient funds',
      });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          fetchTransferStatus={fetchTransferStatus}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Should immediately transition to error
      expect(
        await screen.findByText('CCIP transfer error'),
      ).toBeInTheDocument();
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });

    it('rolls back optimistic updates when transfer initiation fails', async () => {
      const onStartTransfer = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      render(
        <CCIPBridgeModal
          {...defaultProps}
          onStartTransfer={onStartTransfer}
          fetchTransferStatus={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Should show error state
      expect(
        await screen.findByText('CCIP transfer error'),
      ).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();

      // Should not show any transaction details
      expect(screen.queryByText(/Transaction:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Latest status:/)).not.toBeInTheDocument();
    });

    it('maintains PENDING status during transient polling errors', async () => {
      const fetchTransferStatus = vi
        .fn()
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({ status: 'SUCCESS' });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          fetchTransferStatus={fetchTransferStatus}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Initial PENDING status
      expect(
        await screen.findByText('Latest status: PENDING'),
      ).toBeInTheDocument();

      // Advance to next poll (which will fail)
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      // Should maintain PENDING status and polling state
      expect(screen.getByText('Latest status: PENDING')).toBeInTheDocument();
      expect(
        screen.getByText('Waiting for CCIP confirmation…'),
      ).toBeInTheDocument();

      // Advance to final poll (which will succeed)
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      // Should transition to success
      expect(
        await screen.findByText('CCIP transfer confirmed'),
      ).toBeInTheDocument();
    });

    it('immediately shows explorer URL for better user experience', async () => {
      const onStartTransfer = vi.fn().mockResolvedValue({
        transactionHash: '0xdef456',
      });

      render(
        <CCIPBridgeModal
          {...defaultProps}
          onStartTransfer={onStartTransfer}
          fetchTransferStatus={vi.fn().mockResolvedValue({ status: 'PENDING' })}
        />,
      );

      fireEvent.click(screen.getByText('Start CCIP Transfer'));

      // Explorer link should be available immediately after initiation
      const explorerLink = await screen.findByRole('link', {
        name: /view transaction in ccip explorer/i,
      });
      
      expect(explorerLink).toBeInTheDocument();
      expect(explorerLink).toHaveAttribute(
        'href',
        expect.stringContaining('0xdef456'),
      );
    });
  });
});
