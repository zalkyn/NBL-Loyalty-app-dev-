import { useCallback, useEffect, useRef } from "react";

// =============================================================================
// useSubmitLock
//
// Stops a fast double click on Save from submitting twice.
//
// Disabling the button isn't enough on its own any more: Save now usually
// lives in Shopify's contextual save bar, which the admin renders outside the
// app iframe, and the `disabled` state reaches it asynchronously — a quick
// second click can land before it does. On forms with no database-level
// uniqueness (reward rules, prizes…) that creates the record twice.
//
// Usage — take the lock immediately before submitting, after validation:
//
//   const navigation = useNavigation();
//   const tryLock = useSubmitLock(navigation.state);
//   ...
//   if (!tryLock()) return;          // a submit is already in flight
//   submit(data, { method: "post" });
//
// For a fetcher, pass fetcher.state instead.
//
// The lock is released once the request has been seen in flight and the
// state is back to "idle". If nothing ever goes in flight (the submit threw,
// or the caller bailed after locking), a fallback timer releases it so Save
// can never stay dead.
// =============================================================================

const UNUSED_LOCK_RELEASE_MS = 2000;

/**
 * @param {"idle" | "submitting" | "loading"} state - navigation.state or fetcher.state
 * @returns {() => boolean} tryLock — true if the caller may submit now.
 */
export function useSubmitLock(state) {
    const lockedRef = useRef(false);
    const sawBusyRef = useRef(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (state !== "idle") {
            if (lockedRef.current) sawBusyRef.current = true;
            return;
        }
        if (sawBusyRef.current) {
            lockedRef.current = false;
            sawBusyRef.current = false;
            clearTimeout(timerRef.current);
        }
    }, [state]);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    return useCallback(() => {
        if (lockedRef.current) return false;
        lockedRef.current = true;
        sawBusyRef.current = false;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            // Never saw the request go out — don't hold Save hostage.
            if (!sawBusyRef.current) lockedRef.current = false;
        }, UNUSED_LOCK_RELEASE_MS);
        return true;
    }, []);
}
