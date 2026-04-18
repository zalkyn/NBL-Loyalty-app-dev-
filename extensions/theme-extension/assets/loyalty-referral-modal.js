window.NBL_v1 = window.NBL_v1 || {};
// window.NBL_v1.bus => assigned on global.js module 

window.NBL_v1.referralModal = (function () {

    const STORAGE_KEYS = {
        CACHE: "NBL_ReferralCache",
        PENDING_CODE: "NBL_PendingReferral"
    };

    const CACHE_EXPIRY = 2 * 60 * 1000;

    const STEPS = {
        LOGIN: "login",
        FORM: "form",
        SUCCESS: "success",
        LOCKED: "locked"
    };

    let dom = {};
    let activeStep = null;
    let hasCopiedCode = false;

    const bus = window.NBL_v1.bus;

    // ================= STORAGE =================

    function getStore() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHE)) || {};
        } catch {
            return {};
        }
    }

    function setStore(store) {
        localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(store));
    }

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

    function setCache(code, data) {
        const store = getStore();

        store[code] = {
            data,
            expiresAt: Date.now() + CACHE_EXPIRY
        };

        setStore(store);
    }

    function hasUsedValidCode() {
        return Object.values(getStore()).some(i =>
            i?.data?.success && i?.data?.referralDiscountCode
        );
    }

    // ================= URL =================

    function getURLCode() {
        return new URLSearchParams(window.location.search).get("nbl-referral");
    }

    function removeURLCode() {
        const url = new URL(window.location);
        url.searchParams.delete("nbl-referral");
        window.history.replaceState({}, "", url);
    }

    // ✅ NEW: Save pending referral before login
    function savePendingReferralCode(code) {
        if (code) {
            localStorage.setItem(STORAGE_KEYS.PENDING_CODE, code);
        }
    }

    // ✅ NEW: Restore after login
    function restorePendingCode() {
        const urlCode = getURLCode();

        if (urlCode) return urlCode;

        const saved = localStorage.getItem(STORAGE_KEYS.PENDING_CODE);

        if (saved) {
            const url = new URL(window.location);
            url.searchParams.set("nbl-referral", saved);
            window.history.replaceState({}, "", url);

            localStorage.removeItem(STORAGE_KEYS.PENDING_CODE);

            return saved;
        }

        return null;
    }

    // ================= DOM =================

    function cacheDOM() {
        const root = document.querySelector(".nbl-refer-modal-overlay-v1");
        if (!root) return false;

        dom = {
            root,
            closeBtn: root.querySelector(".nbl-refer-modal-close-v1"),

            loginStep: root.querySelector(".nbl-refer-modal-login-step-v1"),
            formStep: root.querySelector(".nbl-refer-modal-form-v1"),
            successStep: root.querySelector(".nbl-refer-modal-success-v1"),
            lockedStep: root.querySelector(".nbl-refer-modal-locked-v1"),

            referralInput: root.querySelector("#referralInput"),
            submitBtn: root.querySelector("#submitBtn"),
            loginBtn: root.querySelector("#loginBtn"),
            finishBtn: root.querySelector("#finishBtn"),
            copyBtn: root.querySelector("#copyBtn"),
            lockedCloseBtn: root.querySelector("#lockedCloseBtn"),

            discountCodeText: root.querySelector("#discountCode"),

            formMessage: root.querySelector("#formMessage"),
            successMessage: root.querySelector("#successMessage"),
            lockedMessage: root.querySelector("#lockedMessage")
        };

        return true;
    }

    // ================= UI =================

    function showMessage(el, type, msg) {
        if (!el) return;

        const icons = {
            success: "✅",
            error: "❌",
            info: "ℹ️"
        };

        el.className = "nbl-refer-modal-message-v1";
        el.classList.add(`nbl-refer-modal-message-${type}-v1`);
        el.textContent = `${icons[type]} ${msg}`;
    }

    function showStep(step) {
        activeStep = step;

        Object.values(STEPS).forEach(s => {
            dom[`${s}Step`]?.classList.add("nbl-hidden-v1");
        });

        dom[`${step}Step`]?.classList.remove("nbl-hidden-v1");
    }

    function openModal() {
        dom.root?.classList.add("show");
        hasCopiedCode = false;
    }

    function closeModal() {
        dom.root?.classList.remove("show");
        removeURLCode();
    }

    // ================= API =================

    async function fetchDiscount(code) {
        try {
            const res = await fetch(`${window.NBL_v1.appConfig?.appUrl}/api/get-referral-discount`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shop: window.Shopify?.shop,
                    customerId: window.NBL_v1?.customer?.id,
                    referralCode: code
                })
            });

            const data = await res.json();

            bus.emit("discount:response", { code, data });

        } catch {
            bus.emit("discount:response", {
                code,
                data: { success: false, message: "Network error. Try again." }
            });
        }
    }

    // ================= BUS =================

    function initBus() {

        bus.on("referralModal:open", openModal);
        bus.on("referralModal:close", closeModal);

        // ✅ UPDATED LOGIN FLOW
        bus.on("referralModal:login", () => {
            const code = getURLCode();
            if (code) savePendingReferralCode(code);

            window.location.href = "/account/login";
        });

        bus.on("referralModal:submit", (code) => {

            if (!code) {
                return showMessage(dom.formMessage, "error", "Please enter a referral code.");
            }

            const cached = getCache(code);
            const used = hasUsedValidCode();

            if (used && !cached?.success) {
                showStep(STEPS.LOCKED);
                return showMessage(dom.lockedMessage, "error", "You already used a referral code.");
            }

            if (cached) {
                if (cached.success) {
                    showStep(STEPS.SUCCESS);
                    dom.discountCodeText.textContent = cached.referralDiscountCode;
                    return showMessage(dom.successMessage, "success", cached?.message || "Loaded from cache.");
                }

                return showMessage(dom.formMessage, "error", cached.message);
            }

            dom.submitBtn.disabled = true;
            dom.submitBtn.innerHTML = "Generating...";

            fetchDiscount(code);
        });

        bus.on("discount:response", ({ code, data }) => {

            dom.submitBtn.disabled = false;
            dom.submitBtn.innerHTML = "Request Discount Code";

            setCache(code, data);

            if (data.success) {
                showStep(STEPS.SUCCESS);
                dom.discountCodeText.textContent = data.referralDiscountCode;
                return showMessage(dom.successMessage, "success", "Your discount code is ready 🎉");
            }

            showMessage(dom.formMessage, "error", data.message);
        });

        bus.on("referralModal:copy", (text) => {
            if (!text) return;

            navigator.clipboard.writeText(text).then(() => {
                hasCopiedCode = true;
                showMessage(dom.successMessage, "success", " Code copied! You can now apply it at checkout.");
            });
        });

        bus.on("referralModal:finish", () => {
            if (activeStep === STEPS.SUCCESS && !hasCopiedCode) {
                return showMessage(dom.successMessage, "error", "Copy your code first.");
            }
            closeModal();
        });
    }

    // ================= DOM EVENTS =================

    function bindEvents() {
        dom.closeBtn?.addEventListener("click", () => bus.emit("referralModal:close"));
        dom.loginBtn?.addEventListener("click", () => bus.emit("referralModal:login"));
        dom.submitBtn?.addEventListener("click", () =>
            bus.emit("referralModal:submit", dom.referralInput?.value.trim())
        );
        dom.copyBtn?.addEventListener("click", () =>
            bus.emit("referralModal:copy", dom.discountCodeText?.textContent)
        );
        dom.finishBtn?.addEventListener("click", () =>
            bus.emit("referralModal:finish")
        );
        dom.lockedCloseBtn?.addEventListener("click", () =>
            bus.emit("referralModal:close")
        );
    }

    // ================= INIT =================

    function initWithRetry(retry = 10) {

        const code = restorePendingCode(); // ✅ FIXED

        if (!cacheDOM()) {
            if (retry > 0) {
                return setTimeout(() => initWithRetry(retry - 1), 300);
            }
            return console.warn("Modal DOM not found");
        }

        bindEvents();
        initBus();

        if (!code) return;

        openModal();

        if (!window.NBL_v1.customer?.id) {
            showStep(STEPS.LOGIN);
            return;
        }

        showStep(STEPS.FORM);
        dom.referralInput.value = code;
    }

    return {
        init() {
            document.addEventListener("DOMContentLoaded", () => {
                initWithRetry();
            });
        }
    };

})();

window.NBL_v1.referralModal.init();