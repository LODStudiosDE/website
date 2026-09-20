// Captures a referral code from the URL (?ref=CODE), stores it briefly, and —
// once the visitor is authenticated with FiveM — attributes their account to
// the referrer exactly once. After a successful Tebex checkout it re-syncs the
// dashboard so the referrer's referral is completed immediately. All validation
// happens server-side.
import { useEffect, useRef } from "react";
import { useTebexAuth } from "@/lib/tebex-auth";
import { attributeReferral, getReferralDashboard } from "@/lib/referral.functions";

const REF_KEY = "lod_ref_v1";

type StoredRef = { code: string; capturedAt: string };

export function ReferralTracker() {
  const { user, isAuthed } = useTebexAuth();
  const attemptedRef = useRef<string | null>(null);
  const syncedCheckout = useRef(false);

  // 1) Capture ?ref= as early as possible and clean the URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (!code) return;
      const clean = code.trim().toUpperCase().slice(0, 32);
      if (clean.length >= 4) {
        localStorage.setItem(
          REF_KEY,
          JSON.stringify({ code: clean, capturedAt: new Date().toISOString() } as StoredRef),
        );
      }
      params.delete("ref");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : ""),
      );
    } catch {
      // ignore
    }
  }, []);

  // 2) Attribute once we have a verified basket.
  useEffect(() => {
    if (!isAuthed || !user?.basketIdent) return;
    let stored: StoredRef | null = null;
    try {
      const raw = localStorage.getItem(REF_KEY);
      if (raw) stored = JSON.parse(raw) as StoredRef;
    } catch {
      stored = null;
    }
    if (!stored?.code) return;
    if (attemptedRef.current === stored.code) return;
    attemptedRef.current = stored.code;

    attributeReferral({
      data: {
        basketIdent: user.basketIdent,
        code: stored.code,
        capturedAt: stored.capturedAt,
      },
    })
      .catch(() => ({ ok: false }))
      .finally(() => {
        // One-time attempt: clear regardless of outcome so we never retry a
        // self-referral / already-attributed code on every navigation.
        try {
          localStorage.removeItem(REF_KEY);
        } catch {
          // ignore
        }
      });
  }, [isAuthed, user?.basketIdent]);

  // 3) After returning from a successful Tebex checkout, force a dashboard sync
  //    so the buyer's referral is evaluated (via the Tebex purchase check) and
  //    the referrer gets credited without waiting for their next visit.
  useEffect(() => {
    if (!isAuthed || !user?.basketIdent) return;
    if (syncedCheckout.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    syncedCheckout.current = true;
    getReferralDashboard({ data: { basketIdent: user.basketIdent } }).catch(() => {
      // ignore — evaluation also runs whenever the dashboard is opened
    });
  }, [isAuthed, user?.basketIdent]);

  return null;
}
