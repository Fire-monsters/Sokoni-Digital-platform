import { useEffect, useState } from "react";
import { AuthError } from "@/services/business-auth";

/** Honor the API's Retry-After window without extending it on each render. */
export function useAuthRetryCooldown(error: unknown) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!(error instanceof AuthError) || error.status !== 429) {
      setSeconds(0);
      return;
    }

    const deadline = Date.now() + error.retryAfter * 1000;
    setSeconds(error.retryAfter);
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [error]);

  return seconds;
}
