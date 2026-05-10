/* =====================================================
   DOM GETTERS
===================================================== */

NBL_v1.getNavItems = () => document.querySelectorAll(".nbl-nav-item-v1");

NBL_v1.getTabItems = () => document.querySelectorAll(".nbl-tab-item-v1");

NBL_v1.getWidgetContainer = () => document.querySelector(".nbl-widget-container-v1");

NBL_v1.getPointsElements = () => document.querySelectorAll(".nbl-customer-points-v1");

/**
 * @param {EventTarget} target - The clicked element
 * @param {string} className   - CSS class to match (without leading dot)
 * @returns {Element|null}
 */
NBL_v1.getTargetElement = (target, className) => {
    return target?.classList?.contains(className)
        ? target
        : target?.closest?.(`.${className}`) || null;
};


/** Opens the loyalty widget and emits widget:opened */
NBL_v1.openWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    container.classList.add("active");
    NBL_v1.bus.emit("widget:opened");
};

/** Closes the loyalty widget and emits widget:closed */
NBL_v1.closeWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    container.classList.remove("active");
    NBL_v1.bus.emit("widget:closed");
};

/** Toggles the loyalty widget open/closed */
NBL_v1.toggleWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    const isOpen = container.classList.toggle("active");
    NBL_v1.bus.emit(isOpen ? "widget:opened" : "widget:closed");
};


//NAVIGATION CONTROLLER

/**
 * Sets the active nav item and tab panel by matching data-nav / data-tab attributes.
 *
 * @param {string} [activeNav="home"] - The nav key to activate
 */
NBL_v1.setActiveNavigation = (activeNav = "home") => {
    const syncActiveState = (getItems, dataKey) => {
        getItems().forEach((item) => {
            item.classList.toggle("active", item.dataset[dataKey] === activeNav);
        });
    };

    syncActiveState(NBL_v1.getNavItems, "nav");
    syncActiveState(NBL_v1.getTabItems, "tab");
};


//UI RENDER

/**
 * Updates all .nbl-customer-points-v1 elements with the current points balance.
 * Uses Intl.NumberFormat for locale-aware formatting (e.g. 1,000).
 */
NBL_v1.uiRender.pointsUpdate = () => {
    const els = NBL_v1.getPointsElements();
    if (!els?.length) return;

    const formatted = Intl.NumberFormat().format(Number(NBL_v1.points || 0));
    els.forEach((el) => (el.innerHTML = formatted));
};


// API SERVICE

/**
 * Sends a request to enroll the current customer in the loyalty program.
 * Emits no bus events — caller is responsible for handling UI feedback.
 *
 * @returns {Promise<void>}
 */
NBL_v1.requestJoinProgram = async () => {
    try {
        const response = await fetch(`${NBL_v1.appConfig.appUrl}/api/join-our-program`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shop: Shopify.shop,
                customerId: NBL_v1?.customer?.id || null,
            }),
            signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const data = await response.json();
        NBL_v1.bus.emit("join:program:success", { data });

    } catch (error) {
        NBL_v1.bus.emit("join:program:error", { error });
    }
};

/**
 * @param {Object} params
 * @param {number} params.rewardRuleId - ID of the reward rule to redeem
 * @param {string} params.title        - Display title of the reward
 */
NBL_v1.requestToGetRewardVoucher = async ({ rewardRuleId, title }) => {
    try {
        if (!rewardRuleId || !NBL_v1?.customer?.id || !NBL_v1.customer?.config?.id) {
            throw new Error("Something went wrong. Missing required customer data.");
        }

        const response = await fetch(`${NBL_v1.appConfig.appUrl}/api/get-reward-voucher`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shop: Shopify.shop,
                customerId: NBL_v1.customer.id,
                rewardRuleId,
                title,
                customerIndex: NBL_v1.customer.config.id,
            }),
            signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const data = await response.json();
        const voucher = data?.voucherCode;

        if (!voucher) throw new Error("Something went wrong. Please try again later.");

        NBL_v1.bus.emit("notify:info:claim:success", { response: data, voucher });

    } catch (error) {
        NBL_v1.bus.emit("notify:info:claim:error", { error });
    }
};


/* =====================================================
   EVENT BUS HANDLERS
===================================================== */

// ── Widget open/close ─────────────────────────────────────────────────────────

NBL_v1.bus.on("event:click", ({ target }) => {
    if (!NBL_v1.getTargetElement(target, "nbl-widget-open-button-v1")) return;
    NBL_v1.toggleWidget();
});

NBL_v1.bus.on("event:click", ({ target }) => {
    if (!NBL_v1.getTargetElement(target, "nbl-widget-close-button-v1")) return;
    NBL_v1.closeWidget();
});

// ── Navigation ────────────────────────────────────────────────────────────────

NBL_v1.bus.on("event:click", ({ target }) => {
    const navElement =
        NBL_v1.getTargetElement(target, "nbl-nav-item-v1") ||
        NBL_v1.getTargetElement(target, "nbl-home-nav-itm-v1");

    if (!navElement) return;

    const activeNav = navElement.dataset.nav;
    if (!activeNav) return;

    NBL_v1.setActiveNavigation(activeNav);
});

// ── Active reward item click (show voucher code) ──────────────────────────────

NBL_v1.bus.on("event:click", ({ target }) => {
    const item = NBL_v1.getTargetElement(target, "nbl-hta-reward-item-v1");
    if (!item) return;

    const { voucher } = item.dataset;
    if (!voucher) return;

    NBL_v1.bus.emit("notify:reward:open", { code: voucher });
});

// ── Reward item click (redeem or insufficient points) ─────────────────────────

NBL_v1.bus.on("event:click", ({ target }) => {
    const el = NBL_v1.getTargetElement(target, "nbl-reward-item-v1");
    if (!el) return;

    if (el.classList.contains("active")) {
        const rewardRuleId = Number(el.dataset?.rewardRuleId);
        const title = el.dataset?.title;
        const rewardRule = NBL_v1.appConfig?.rewardRules?.find((r) => r.id === rewardRuleId);

        NBL_v1.bus.emit("notify:info:open", {
            payload: {
                text: `Spend ${rewardRule?.pointsCost} points for this reward?`,
                claim: true,
                data: { rewardRule, title },
            },
        });
    } else {
        NBL_v1.bus.emit("notify:info:open", {
            payload: { text: "Insufficient point balance" },
        });
    }
});

// ── Earn points item click (show label info) ──────────────────────────────────

NBL_v1.bus.on("event:click", ({ target }) => {
    const el = NBL_v1.getTargetElement(target, "nbl-points-item-v1");
    if (!el) return;

    NBL_v1.bus.emit("notify:info:open", {
        payload: { text: el?.dataset?.label },
    });
});

// ── Points update ─────────────────────────────────────────────────────────────

NBL_v1.bus.on("points:update", (points) => {
    NBL_v1.points = points;
    NBL_v1.uiRender.pointsUpdate();
});

// ── Claim start: trigger voucher request ──────────────────────────────────────

NBL_v1.bus.on("notify:info:claim:start", ({ data }) => {
    const rewardRule = data?.rewardRule;
    if (!rewardRule?.id) return;

    NBL_v1.requestToGetRewardVoucher({
        rewardRuleId: rewardRule.id,
        title: data?.title,
    });
});

// ── Claim success: update points balance and re-render reward list ────────────

NBL_v1.bus.on("notify:info:claim:success", ({ response }) => {
    const points = Number(response?.points);
    if (isNaN(points)) return;

    NBL_v1.bus.emit("points:update", points);
    NBL_v1.tab.renderRewardList();
});