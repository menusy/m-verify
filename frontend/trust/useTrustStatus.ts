import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TRUST_COOKIE_NAME = 'gov_trust_token';
const STATUS_ENDPOINT = '/api/trust/trust-status';
const START_ENDPOINT = '/api/trust/start-verification';
const VERIFY_ENDPOINT = '/api/trust/verify-status';
const POLL_INTERVAL_MS = 4000;

type TrustUiState =
  | { status: 'loading' }
  | { status: 'unverified'; message?: string }
  | { status: 'verified'; trustImageUrl: string; lastVerifiedAt: string }
  | { status: 'error'; message: string };

export type VerificationSession = {
  sessionId: string;
  qrCodeUrl: string;
  startedAt: number;
};

type TrustStatusResponse =
  | { trusted: true; trustImageUrl: string; lastVerifiedAt: string }
  | { trusted: false };

type VerifyStatusResponse =
  | {
      trusted: true;
      trustToken: string;
      trustImageUrl: string;
      lastVerifiedAt: string;
    }
  | { trusted: false };

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Wystąpił nieznany błąd.';
};

const buildHostname = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.location.hostname;
  } catch {
    return '';
  }
};

export const useTrustStatus = () => {
  const [hostname] = useState(() => buildHostname());
  const [state, setState] = useState<TrustUiState>({ status: 'loading' });
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollCancelRef = useRef<() => void>();

  const queryString = useMemo(() => {
    if (!hostname) return '';
    return new URLSearchParams({ hostname }).toString();
  }, [hostname]);

  const fetchTrustStatus = useCallback(async () => {
    if (!queryString) {
      setState({ status: 'error', message: 'Brak nazwy hosta.' });
      return;
    }

    setState((prev) => (prev.status === 'loading' ? prev : { status: 'loading' }));

    try {
      const response = await fetch(`${STATUS_ENDPOINT}?${queryString}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Nie udało się pobrać statusu zaufania.');
      }

      const payload = (await response.json()) as TrustStatusResponse;

      if (payload.trusted) {
        setState({
          status: 'verified',
          trustImageUrl: payload.trustImageUrl,
          lastVerifiedAt: payload.lastVerifiedAt
        });
      } else {
        setState({ status: 'unverified' });
      }
    } catch (error) {
      setState({ status: 'error', message: formatError(error) });
    }
  }, [queryString]);

  const startVerification = useCallback(async () => {
    if (!queryString) {
      setState({ status: 'error', message: 'Brak nazwy hosta.' });
      return;
    }

    setIsStarting(true);
    setState((prev) =>
      prev.status === 'error' ? { status: 'unverified' } : prev
    );

    try {
      const response = await fetch(START_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ hostname })
      });

      if (!response.ok) {
        throw new Error('Nie udało się rozpocząć procesu weryfikacji.');
      }

      const payload = (await response.json()) as {
        sessionId: string;
        qrCodeUrl: string;
      };

      setSession({
        sessionId: payload.sessionId,
        qrCodeUrl: payload.qrCodeUrl,
        startedAt: Date.now()
      });
    } catch (error) {
      setState({ status: 'error', message: formatError(error) });
    } finally {
      setIsStarting(false);
    }
  }, [hostname, queryString]);

  const stopPolling = useCallback(() => {
    pollCancelRef.current?.();
    pollCancelRef.current = undefined;
    setIsPolling(false);
  }, []);

  useEffect(() => {
    void fetchTrustStatus();
    return () => {
      stopPolling();
    };
  }, [fetchTrustStatus, stopPolling]);

  useEffect(() => {
    if (!session) {
      stopPolling();
      return;
    }

    let cancelled = false;
    setIsPolling(true);

    const poll = async () => {
      try {
        const response = await fetch(
          `${VERIFY_ENDPOINT}?sessionId=${encodeURIComponent(session.sessionId)}`,
          {
            credentials: 'include'
          }
        );

        if (!response.ok) {
          throw new Error('Nie można pobrać statusu sesji.');
        }

        const payload = (await response.json()) as VerifyStatusResponse;

        if (payload.trusted) {
          setState({
            status: 'verified',
            trustImageUrl: payload.trustImageUrl,
            lastVerifiedAt: payload.lastVerifiedAt
          });
          setSession(null);
          stopPolling();
        }
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', message: formatError(error) });
        }
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    pollCancelRef.current = () => window.clearInterval(intervalId);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      pollCancelRef.current = undefined;
      setIsPolling(false);
    };
  }, [session, stopPolling]);

  const refreshStatus = useCallback(async () => {
    await fetchTrustStatus();
  }, [fetchTrustStatus]);

  return {
    hostname,
    state,
    session,
    isStarting,
    isPolling,
    startVerification,
    refreshStatus,
    trustCookieName: TRUST_COOKIE_NAME
  };
};

export type UseTrustStatusReturn = ReturnType<typeof useTrustStatus>;

