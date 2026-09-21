import { useQuery } from "@tanstack/react-query";
import { getReferralStatus } from "@/lib/referral.functions";

export const REFERRAL_STATUS_KEY = ["referral", "status"] as const;

/**
 * Live on/off state of the referral program. Re-checked every 15 s (while the
 * tab is visible) and whenever the window regains focus, so switching it off in
 * the admin panel takes effect for everyone within moments.
 */
export function useReferralStatus() {
  const query = useQuery({
    queryKey: REFERRAL_STATUS_KEY,
    queryFn: () => getReferralStatus(),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  return {
    /** True only once the server confirmed the program is on (links stay hidden until then). */
    enabled: query.data?.configured === true && query.data.enabled === true,
    /** True when the program exists but an admin switched it off. */
    maintenance: query.data?.configured === true && query.data.enabled === false,
  };
}
