window.NBL_v1 = window.NBL_v1 || {};

window.NBL_v1.referralModal = (function () {

    // =====================================================
    // CONFIGURATION
    // =====================================================

    /**
     * Form behavior config.
     * AUTO_SUBMIT: true  = form step এ আসলেই auto submit হবে, button hidden থাকবে
     * AUTO_SUBMIT: false = manual button click দরকার
     */
    const FORM_CONFIG = {
        AUTO_SUBMIT: true,
    };

    /**
     * Cache TTL config.
     * Success → বেশিক্ষণ cache, Failure → দ্রুত expire করে retry allow করে।
     */
    const CACHE_CONFIG = {
        SUCCESS_TTL_MS: 1 * 60 * 1000, // 1 minute
        FAILURE_TTL_MS: 30 * 1000,     // 30 seconds
        SWEEP_INTERVAL_MS: 30 * 1000,     // sweep every 30s (matches failure TTL)
    };

    const STORAGE_KEYS = {
        CACHE: "NBL_ReferralCache",
        PENDING_CODE: "NBL_PendingReferral",
    };

    /**
     * Step registry.
     *
     * To add a new step:
     *   1. Add entry here:        NEW_STEP: "newStep"
     *   2. Add DOM in HTML:       <div class="nbl-refer-modal-newStep-v1 nbl-hidden-v1">
     *   3. Add to cacheDOM():     newStep: root.querySelector(".nbl-refer-modal-newStep-v1")
     *   4. Trigger via bus:       showStep(STEPS.NEW_STEP)
     */
    const STEPS = {
        LOGIN: "login",
        FORM: "form",
        SUCCESS: "success",
        LOCKED: "locked",
    };

    /**
     * Backend error codes that route to the LOCKED step instead of the form error.
     * Add new conflict codes here as backend evolves.
     */
    const LOCKED_STEP_CODES = [
        "DISCOUNT_ALREADY_USED",
        "REFERRAL_ALREADY_LOCKED",
    ];

    /**
     * Fallback messages when the server doesn't return a message body.
     * Keyed by HTTP status code.
     */
    const HTTP_ERROR_MESSAGES = {
        400: "Invalid request. Please refresh and try again.",
        404: "Referral code not found. Please check the code.",
        409: "This referral code has already been used.",
        422: "You are not eligible for this referral discount.",
        500: "Something went wrong on our end. Please try again later.",
    };

    // =====================================================
    // STATE
    // =====================================================

    let dom = {};
    let activeStep = null;
    let hasCopiedCode = false;
    let sweepIntervalId = null;
    let submitTimeoutId = null;

    const bus = window.NBL_v1.bus;

    // =====================================================
    // STORAGE
    // =====================================================

    /**
     * Safely reads the full cache store from localStorage.
     *
     * @returns {Object}
     */
    function getStore() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHE)) || {};
        } catch {
            return {};
        }
    }

    /**
     * Safely writes the cache store to localStorage.
     * Silently no-ops if storage is unavailable.
     *
     * @param {Object} store
     */
    function setStore(store) {
        try {
            localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(store));
        } catch {
            // localStorage unavailable — private browsing or quota exceeded
        }
    }

    /**
     * Reads a cached API response.
     * Returns null and auto-cleans if entry is expired.
     *
     * @param {string} code
     * @returns {Object|null}
     */
    function getCache(code) {
        const store = getStore();
        const item = store[code];
        if (!item) return null;

        if (Date.now() > item.expiresAt) {
            delete store[code];
            setStore(store);
            return null;
        }

        return item.data;
    }

    /**
     * Caches an API response with TTL based on success/failure.
     *
     * @param {string} code
     * @param {Object} data
     */
    function setCache(code, data) {
        const ttl = data.success
            ? CACHE_CONFIG.SUCCESS_TTL_MS
            : CACHE_CONFIG.FAILURE_TTL_MS;

        const store = getStore();
        store[code] = { data, expiresAt: Date.now() + ttl };
        setStore(store);
    }

    /**
     * Removes all expired entries from the cache store.
     * Emits referralModal:cache:swept when entries are removed.
     */
    function sweepExpiredCache() {
        const store = getStore();
        const now = Date.now();
        let swept = 0;

        Object.keys(store).forEach((code) => {
            if (now > store[code].expiresAt) {
                delete store[code];
                swept++;
            }
        });

        if (swept > 0) {
            setStore(store);
            bus.emit("referralModal:cache:swept", { swept });
        }
    }

    /**
     * Starts the recurring cache sweep interval.
     * Guards against duplicate intervals on re-init.
     */
    function startCacheSweep() {
        if (sweepIntervalId) clearInterval(sweepIntervalId);
        sweepIntervalId = setInterval(sweepExpiredCache, CACHE_CONFIG.SWEEP_INTERVAL_MS);
    }

    /**
     * Client-side pre-check: has the customer already redeemed a code?
     * NOTE: fast local check only — server is authoritative.
     *
     * @returns {boolean}
     */
    function hasUsedValidCode() {
        return Object.values(getStore()).some(
            (i) => i?.data?.success && i?.data?.referralDiscountCode
        );
    }

    // =====================================================
    // URL
    // =====================================================

    /** @returns {string|null} */
    function getURLCode() {
        return new URLSearchParams(window.location.search).get("nbl-referral");
    }

    /** Removes referral param from URL without reloading */
    function removeURLCode() {
        const url = new URL(window.location.href);
        url.searchParams.delete("nbl-referral");
        window.history.replaceState({}, "", url);
    }

    /**
     * Saves referral code to localStorage before login redirect.
     *
     * @param {string} code
     */
    function savePendingReferralCode(code) {
        if (code) localStorage.setItem(STORAGE_KEYS.PENDING_CODE, code);
    }

    /**
     * Restores referral code after login redirect.
     * Priority: URL param > localStorage fallback.
     *
     * @returns {string|null}
     */
    function restorePendingCode() {
        const urlCode = getURLCode();
        if (urlCode) return urlCode;

        const saved = localStorage.getItem(STORAGE_KEYS.PENDING_CODE);
        if (!saved) return null;

        const url = new URL(window.location.href);
        url.searchParams.set("nbl-referral", saved);
        window.history.replaceState({}, "", url);
        localStorage.removeItem(STORAGE_KEYS.PENDING_CODE);

        return saved;
    }

    // =====================================================
    // DOM
    // =====================================================

    /**
     * Queries and caches all DOM references from the modal root.
     *
     * To add a new step's DOM element:
     *   newStep: root.querySelector(".nbl-refer-modal-newStep-v1")
     *
     * @returns {boolean} false if modal root not found
     */
    function cacheDOM() {
        const root = document.querySelector(".nbl-refer-modal-overlay-v1");
        if (!root) return false;

        dom = {
            root,
            closeBtn: root.querySelector(".nbl-refer-modal-close-v1"),

            // Steps
            loginStep: root.querySelector(".nbl-refer-modal-login-step-v1"),
            formStep: root.querySelector(".nbl-refer-modal-form-v1"),
            successStep: root.querySelector(".nbl-refer-modal-success-v1"),
            lockedStep: root.querySelector(".nbl-refer-modal-locked-v1"),

            // Form step
            referralInput: root.querySelector("#referralInput"),
            submitBtn: root.querySelector("#submitBtn"),

            // Login step
            loginBtn: root.querySelector("#loginBtn"),

            // Success step
            finishBtn: root.querySelector("#finishBtn"),
            copyBtn: root.querySelector("#copyBtn"),
            copiedText: root.querySelector(".nbl-refer-modal-copied-text-v1"),
            discountCodeText: root.querySelector("#discountCode"),

            // Locked step
            lockedCloseBtn: root.querySelector("#lockedCloseBtn"),

            // Message containers
            formMessage: root.querySelector("#formMessage"),
            successMessage: root.querySelector("#successMessage"),
            lockedMessage: root.querySelector("#lockedMessage"),
        };

        return true;
    }

    // =====================================================
    // UI HELPERS
    // =====================================================

    /**
     * Renders a status message in a modal message container.
     *
     * @param {Element} el
     * @param {"success"|"error"|"info"} type
     * @param {string} msg
     */
    function showMessage(el, type, msg) {
        if (!el) return;
        const icons = { success: "✅", error: "❌", info: "ℹ️" };
        el.className = `nbl-refer-modal-message-v1 nbl-refer-modal-message-${type}-v1`;
        el.textContent = `${icons[type] ?? ""} ${msg}`;
    }

    /**
     * Clears a modal message container.
     *
     * @param {Element} el
     */
    function clearMessage(el) {
        if (!el) return;
        el.className = "nbl-refer-modal-message-v1";
        el.textContent = "";
    }

    /**
     * Transitions the modal to the given step.
     * Hides all registered steps, reveals only the target.
     * Emits referralModal:step:changed on the bus.
     *
     * @param {string} step - One of STEPS.*
     */
    function showStep(step) {
        activeStep = step;

        Object.values(STEPS).forEach((s) => {
            dom[`${s}Step`]?.classList.add("nbl-hidden-v1");
        });

        dom[`${step}Step`]?.classList.remove("nbl-hidden-v1");
        bus.emit("referralModal:step:changed", { step });
    }

    /** Opens the modal and resets copied state */
    function openModal() {
        dom.root?.classList.add("show");
        hasCopiedCode = false;
        bus.emit("referralModal:opened");
    }

    /** Closes the modal and cleans up the URL */
    function closeModal() {
        dom.root?.classList.remove("show");
        removeURLCode();
        bus.emit("referralModal:closed");
    }

    /**
     * Applies FORM_CONFIG.AUTO_SUBMIT behavior when the form step is shown.
     *
     * AUTO_SUBMIT: true  = hides submit button, shows loader, auto-submits
     * AUTO_SUBMIT: false = shows submit button, waits for manual click
     *
     * @param {string|null} code
     */
    function applyFormConfig(code) {
        if (FORM_CONFIG.AUTO_SUBMIT) {
            dom.submitBtn?.classList.add("nbl-hidden-v1");
            if (code) {
                showAutoSubmitLoader();
                bus.emit("referralModal:submit", code);
            }
        } else {
            dom.submitBtn?.classList.remove("nbl-hidden-v1");
        }
    }

    /**
     * Shows a loading indicator in the form step during auto-submit.
     * Inserted after the submit button position.
     * Removed automatically when the API response arrives.
     */
    function showAutoSubmitLoader() {
        // Avoid duplicate loaders
        if (dom.formStep?.querySelector(".nbl-refer-modal-loader-v1")) return;

        const loader = document.createElement("div");
        loader.className = "nbl-refer-modal-loader-v1";
        loader.innerHTML = `
            <span class="nbl-refer-modal-loader-spinner-v1"></span>
            <span class="nbl-refer-modal-loader-text-v1">Verifying your referral code...</span>
        `;

        // Insert in place of the hidden submit button
        dom.submitBtn?.insertAdjacentElement("afterend", loader);
    }

    /**
     * Removes the auto-submit loader from the form step.
     * Called when API response arrives or on safety timeout.
     */
    function removeAutoSubmitLoader() {
        dom.formStep?.querySelector(".nbl-refer-modal-loader-v1")?.remove();
    }

    /**
     * Resets the submit button to its default idle state.
     * Also removes the auto-submit loader if present.
     */
    function resetSubmitBtn() {
        removeAutoSubmitLoader();
        if (!dom.submitBtn) return;
        dom.submitBtn.disabled = false;
        dom.submitBtn.textContent = "Request Discount Code";
    }

    /**
     * Gives clear visual feedback after a successful clipboard copy.
     * Temporarily changes button label, shows inline confirmation.
     * Resets after 2.5 seconds.
     */
    function showCopyFeedback() {
        if (!dom.copyBtn) return;

        dom.copyBtn.textContent = "Copied ✓";
        dom.copyBtn.disabled = true;
        dom.copyBtn.classList.add("nbl-refer-modal-copy-btn-success-v1");
        dom.copiedText?.classList.remove("nbl-hidden-v1");

        showMessage(dom.successMessage, "success", "Code copied! Apply it at checkout.");

        setTimeout(() => {
            dom.copyBtn.textContent = "Copy Code";
            dom.copyBtn.disabled = false;
            dom.copyBtn.classList.remove("nbl-refer-modal-copy-btn-success-v1");
            dom.copiedText?.classList.add("nbl-hidden-v1");
        }, 2500);
    }

    /**
     * Copies text to clipboard.
     * Uses modern Clipboard API with legacy execCommand fallback
     * for HTTP environments and older browsers.
     *
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async function copyToClipboard(text) {
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Fall through to legacy fallback
            }
        }

        try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand("copy");
            document.body.removeChild(textarea);
            return success;
        } catch {
            return false;
        }
    }

    // =====================================================
    // API
    // =====================================================

    /**
     * Fetches a referral discount from the app backend.
     * Always bypasses cache — check getCache() before calling.
     *
     * Sets an 8s safety timeout to reset the UI if no response arrives.
     * Emits discount:response on the bus with { code, data }.
     *
     * @param {string} code
     */
    async function fetchDiscount(code) {
        if (submitTimeoutId) clearTimeout(submitTimeoutId);

        // Safety net — reset UI if response never arrives
        submitTimeoutId = setTimeout(() => {
            resetSubmitBtn();
            showMessage(dom.formMessage, "error", "Request timed out. Please try again.");
        }, 8000);

        try {
            const res = await fetch(
                `${window.NBL_v1.appConfig?.appUrl}/api/get-referral-discount`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        shop: window.Shopify?.shop,
                        customerId: window.NBL_v1?.customer?.id,
                        referralCode: code,
                    }),
                    signal: AbortSignal.timeout
                        ? AbortSignal.timeout(6000)
                        : undefined, // graceful fallback for older Safari
                }
            );

            const data = await res.json();

            // Attach HTTP status for downstream handling
            data._status = res.status;

            // Use fallback message if server didn't provide one
            if (!res.ok && !data.message) {
                data.message = HTTP_ERROR_MESSAGES[res.status] || HTTP_ERROR_MESSAGES[500];
            }

            bus.emit("discount:response", { code, data });

        } catch (err) {
            bus.emit("discount:response", {
                code,
                data: {
                    success: false,
                    _status: 0,
                    message: err?.name === "TimeoutError"
                        ? "Request timed out. Please try again."
                        : "Network error. Please check your connection and try again.",
                },
            });
        } finally {
            clearTimeout(submitTimeoutId);
        }
    }

    // =====================================================
    // BUS HANDLERS
    // =====================================================

    /**
     * Registers all event bus listeners.
     *
     * ── Public events (emit from anywhere to control the modal) ──────────────
     *   referralModal:open              — opens the modal
     *   referralModal:close             — closes the modal
     *   referralModal:login             — saves pending code + redirects to login
     *   referralModal:submit(code)      — validates + fetches discount for code
     *   referralModal:copy(text)        — copies text to clipboard
     *   referralModal:finish            — closes modal (requires code copied first)
     *
     * ── Internal events (emit by this module, listen from outside) ────────────
     *   referralModal:opened            — modal just opened
     *   referralModal:closed            — modal just closed
     *   referralModal:step:changed      — step transitioned { step }
     *   referralModal:cache:swept       — expired cache keys removed { swept }
     *   discount:response               — API response arrived { code, data }
     */
    function initBus() {

        // ── Open / close ──────────────────────────────────────────────────────
        bus.on("referralModal:open", openModal);
        bus.on("referralModal:close", closeModal);

        // ── Login redirect ────────────────────────────────────────────────────
        bus.on("referralModal:login", () => {
            const code = getURLCode();
            if (code) savePendingReferralCode(code);
            window.location.href = "/account/login";
        });

        // ── Submit referral code ──────────────────────────────────────────────
        bus.on("referralModal:submit", (code) => {
            clearMessage(dom.formMessage);

            if (!code) {
                return showMessage(dom.formMessage, "error", "Please enter a referral code.");
            }

            // Client-side pre-guard (server is authoritative)
            if (hasUsedValidCode()) {
                showStep(STEPS.LOCKED);
                return showMessage(dom.lockedMessage, "error", "You have already used a referral code.");
            }

            // Serve from cache if still valid
            const cached = getCache(code);

            if (cached) {
                removeAutoSubmitLoader(); // clear loader even on cache hit

                if (cached.success) {
                    showStep(STEPS.SUCCESS);
                    dom.discountCodeText.textContent = cached.referralDiscountCode;
                    return showMessage(dom.successMessage, "success", cached.message || "Your code is ready!");
                }

                if (LOCKED_STEP_CODES.includes(cached.code)) {
                    showStep(STEPS.LOCKED);
                    return showMessage(dom.lockedMessage, "error", cached.message);
                }

                return showMessage(dom.formMessage, "error", cached.message);
            }

            // Cache miss or expired — show loading state then fetch
            if (!FORM_CONFIG.AUTO_SUBMIT) {
                dom.submitBtn.disabled = true;
                dom.submitBtn.textContent = "Generating...";
            }

            fetchDiscount(code);
        });

        // ── Handle API response ───────────────────────────────────────────────
        bus.on("discount:response", ({ code, data }) => {
            resetSubmitBtn(); // clears loader + resets button

            setCache(code, data);

            if (data.success) {
                showStep(STEPS.SUCCESS);
                dom.discountCodeText.textContent = data.referralDiscountCode;
                return showMessage(dom.successMessage, "success", data.message);
            }

            if (LOCKED_STEP_CODES.includes(data.code)) {
                showStep(STEPS.LOCKED);
                return showMessage(dom.lockedMessage, "error", data.message);
            }

            showMessage(dom.formMessage, "error", data.message);
        });

        // ── Copy to clipboard ─────────────────────────────────────────────────
        bus.on("referralModal:copy", async (text) => {
            if (!text) return;

            const success = await copyToClipboard(text);

            if (success) {
                hasCopiedCode = true;
                showCopyFeedback();
            } else {
                showMessage(
                    dom.successMessage,
                    "error",
                    "Copy failed. Please select and copy the code manually."
                );
            }
        });

        // ── Finish / close guard ──────────────────────────────────────────────
        bus.on("referralModal:finish", () => {
            if (activeStep === STEPS.SUCCESS && !hasCopiedCode) {
                return showMessage(
                    dom.successMessage,
                    "error",
                    "Please copy your code before closing."
                );
            }
            closeModal();
        });
    }

    // =====================================================
    // DOM EVENTS
    // =====================================================

    /**
     * Binds native DOM click events and proxies through the bus.
     * Zero business logic here — all logic lives in initBus().
     */
    function bindEvents() {
        dom.closeBtn?.addEventListener("click", () => bus.emit("referralModal:close"));
        dom.loginBtn?.addEventListener("click", () => bus.emit("referralModal:login"));
        dom.finishBtn?.addEventListener("click", () => bus.emit("referralModal:finish"));
        dom.lockedCloseBtn?.addEventListener("click", () => bus.emit("referralModal:close"));

        dom.submitBtn?.addEventListener("click", () =>
            bus.emit("referralModal:submit", dom.referralInput?.value.trim())
        );

        dom.copyBtn?.addEventListener("click", () =>
            bus.emit("referralModal:copy", dom.discountCodeText?.textContent?.trim())
        );
    }

    // =====================================================
    // INIT
    // =====================================================

    /**
     * Attempts to initialize the modal, retrying up to `retry` times (300ms apart)
     * to handle late DOM injection by Shopify themes.
     *
     * @param {number} [retry=10]
     */
    function initWithRetry(retry = 10) {
        const code = restorePendingCode();

        if (!cacheDOM()) {
            if (retry > 0) return setTimeout(() => initWithRetry(retry - 1), 300);
            return console.warn("[NBL] Referral modal DOM not found after retries.");
        }

        bindEvents();
        initBus();
        startCacheSweep();

        if (!code) return;

        openModal();

        if (!window.NBL_v1.customer?.id) {
            showStep(STEPS.LOGIN);
            return;
        }

        // Customer logged in — go to form and apply config
        showStep(STEPS.FORM);
        dom.referralInput.value = code;
        applyFormConfig(code);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        /**
         * Bootstraps the referral modal on DOMContentLoaded.
         * Safe to call once per page — idempotent via the IIFE wrapper.
         */
        init() {
            document.addEventListener("DOMContentLoaded", () => initWithRetry());
        },
    };

})();

window.NBL_v1.referralModal.init();