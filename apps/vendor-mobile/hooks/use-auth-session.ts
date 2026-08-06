import { apiQueryKeys, fetchMe, fetchOnboarding } from '@sokoni-digital/api-client';
import { decideProtectedRoute, reduceAuthSession } from '@sokoni-digital/auth';
import type { AuthSessionState, ProtectedRouteArea } from '@sokoni-digital/domain';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useMemo } from 'react';

const apiBaseUrl = 'http://localhost:4000';

function useAccessToken(): string | undefined {
  return undefined;
}

export function useMeQuery() {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: apiQueryKeys.me,
    queryFn: () => fetchMe({ baseUrl: apiBaseUrl, accessToken }),
    enabled: Boolean(accessToken),
    networkMode: 'offlineFirst',
    staleTime: 30_000,
  });
}

export function useOnboardingQuery() {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: apiQueryKeys.onboarding,
    queryFn: () => fetchOnboarding({ baseUrl: apiBaseUrl, accessToken }),
    enabled: Boolean(accessToken),
    networkMode: 'offlineFirst',
    staleTime: 30_000,
  });
}

export function useAuthSession(): AuthSessionState {
  const accessToken = useAccessToken();
  const meQuery = useMeQuery();
  const onboardingQuery = useOnboardingQuery();

  return useMemo(() => {
    if (!accessToken) {
      return reduceAuthSession({ status: 'loading' }, { type: 'session_missing' });
    }

    if (meQuery.isPending || onboardingQuery.isPending) {
      return reduceAuthSession({ status: 'guest' }, { type: 'session_loading' });
    }

    if (meQuery.isError) {
      return reduceAuthSession(
        { status: 'loading' },
        { type: 'session_failed', message: meQuery.error.message },
      );
    }

    if (!meQuery.data) {
      return reduceAuthSession({ status: 'loading' }, { type: 'session_missing' });
    }

    return reduceAuthSession(
      { status: 'loading' },
      {
        type: 'profile_loaded',
        profile: meQuery.data,
        ...(onboardingQuery.data ? { onboarding: onboardingQuery.data } : {}),
      },
    );
  }, [
    accessToken,
    meQuery.data,
    meQuery.error,
    meQuery.isError,
    meQuery.isPending,
    onboardingQuery.data,
    onboardingQuery.isPending,
  ]);
}

export function useProtectedRoute(area: ProtectedRouteArea) {
  const session = useAuthSession();
  const decision = decideProtectedRoute(session, area);

  useEffect(() => {
    if (decision.action === 'redirect') {
      router.replace(decision.pathname as Href);
    }
  }, [decision]);

  return {
    session,
    decision,
    isAllowed: decision.action === 'allow',
  };
}
