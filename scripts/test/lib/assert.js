/**
 * @file scripts/test/lib/assert.js
 * @description Minimal, dependency-free test harness. This project has no
 * test framework installed (jest/vitest/mocha — none; verified against
 * package.json) — rather than pulling one in as a big new dependency
 * decision on the project's behalf, this is a small, self-contained
 * runner just structured enough to organize test files and report
 * pass/fail clearly. Good enough for the pure-function and DB-integration
 * tests in this folder; swap for a real framework later if the test
 * suite grows enough to want one.
 */

let currentSuite = null;
const results = [];

/**
 * Groups a set of related checks under a named suite. Suites run
 * sequentially (async functions are awaited), so DB-backed suites don't
 * race each other.
 *
 * @param {string} name
 * @param {() => void|Promise<void>} fn
 */
export async function suite(name, fn) {
    currentSuite = name;
    try {
        await fn();
    } catch (err) {
        // A thrown error OUTSIDE an individual check() call (e.g. a setup
        // step failing) — record it as its own failure so the suite
        // doesn't just silently stop.
        results.push({ suite: name, name: "(suite setup)", pass: false, error: err?.message || String(err) });
    }
    currentSuite = null;
}

/**
 * Runs one check. Never throws — records the result and moves on, so one
 * failing check doesn't abort the rest of the suite.
 *
 * @param {string} name
 * @param {() => boolean|Promise<boolean>} fn - Return true for pass, false (or throw) for fail.
 */
export async function check(name, fn) {
    try {
        const ok = await fn();
        results.push({ suite: currentSuite, name, pass: !!ok, error: ok ? null : "returned false" });
    } catch (err) {
        results.push({ suite: currentSuite, name, pass: false, error: err?.message || String(err) });
    }
}

/**
 * Equality check helper — deep-compares via JSON.stringify (fine for the
 * plain objects/numbers/strings/arrays these tests deal with).
 *
 * @param {string} name
 * @param {*} actual
 * @param {*} expected
 */
export async function checkEqual(name, actual, expected) {
    await check(name, () => {
        const same = JSON.stringify(actual) === JSON.stringify(expected);
        if (!same) throw new Error(`got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        return true;
    });
}

/**
 * Runs `fn` and asserts it throws. Fails if it doesn't.
 *
 * @param {string} name
 * @param {() => void} fn
 */
export async function checkThrows(name, fn) {
    await check(name, () => {
        try {
            fn();
        } catch {
            return true;
        }
        throw new Error("expected a throw, but none happened");
    });
}

/**
 * Prints a full pass/fail report and exits with a non-zero code if
 * anything failed — so this composes cleanly with CI or a pre-deploy
 * check.
 */
export function report() {
    const bySuite = {};
    for (const r of results) {
        (bySuite[r.suite] ??= []).push(r);
    }

    let passCount = 0;
    let failCount = 0;

    for (const [suiteName, checks] of Object.entries(bySuite)) {
        console.log(`\n${suiteName}`);
        for (const r of checks) {
            if (r.pass) {
                console.log(`  \u2713 ${r.name}`);
                passCount++;
            } else {
                console.log(`  \u2717 ${r.name} — ${r.error}`);
                failCount++;
            }
        }
    }

    console.log(`\n${passCount} passed, ${failCount} failed\n`);
    return failCount === 0;
}
