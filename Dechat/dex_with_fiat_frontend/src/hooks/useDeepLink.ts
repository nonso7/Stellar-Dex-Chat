'use client';

import { useEffect, useState } from 'react';

export type DeepLinkState =
  | { status: 'idle' }
  | { status: 'loading'; sessionId: string }
  | { status: 'not-found'; sessionId: string };

/**
 * Reads the URL hash on mount and attempts to navigate to the referenced
 * chat session.  Expected format: /chat#<session-id>
 *
 * @param loadChatSession - Callback that loads a session by ID and returns
 *   whether the session was found.
 */
export function useDeepLink(
  loadChatSession: (sessionId: string) => void,
  hasSessionLoaded: (sessionId: string) => boolean,
): DeepLinkState {
  const [state, setState] = useState<DeepLinkState>({ status: 'idle' });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash.slice(1).trim(); // strip leading '#'
    if (!hash) return;

    setState({ status: 'loading', sessionId: hash });

    // loadChatSession is synchronous; after calling it, check whether the
    // session is now current to determine success vs. not-found.
    loadChatSession(hash);

    if (hasSessionLoaded(hash)) {
      setState({ status: 'idle' });
    } else {
      setState({ status: 'not-found', sessionId: hash });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return state;
}
