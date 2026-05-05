
/* =====================================================
   DOM GETTERS
===================================================== */

NBL_v1.getNavItems = () => document.querySelectorAll(".nbl-nav-item-v1");

NBL_v1.getTabItems = () => document.querySelectorAll(".nbl-tab-item-v1");

NBL_v1.getWidgetContainer = () => document.querySelector(".nbl-widget-container-v1");

NBL_v1.getTargetElement = (target, className) => {
    return target.classList.contains(className)
        ? target
        : target.closest(`.${className}`);
};

NBL_v1.getPointsElements = () => document.querySelectorAll(".nbl-customer-points-v1");


/* =====================================================
   WIDGET CONTROLLER
===================================================== */

// Open widget
NBL_v1.openWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    container.classList.add("active");
    NBL_v1.bus.emit("widget:opened");
};


// Close widget
NBL_v1.closeWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    container.classList.remove("active");
    NBL_v1.bus.emit("widget:closed");
};


// Toggle widget
NBL_v1.toggleWidget = () => {
    const container = NBL_v1.getWidgetContainer();
    if (!container) return;

    const isOpen = container.classList.toggle("active");

    NBL_v1.bus.emit(isOpen ? "widget:opened" : "widget:closed");
};


/* =====================================================
   API SERVICE
===================================================== */

// Join loyalty program request
NBL_v1.requestJoinProgram = async () => {
    try {
        const response = await fetch(
            `${NBL_v1.appConfig.appUrl}/api/join-program`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    shop: Shopify.shop,
                    customerId: NBL_v1?.customer?.id || null
                }),
                signal: AbortSignal.timeout(6000)
            }
        );

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }

        const data = await response.json();

        console.log("Join Program Success:", data);

    } catch (error) {
        console.error("Join Program Error:", error);
    }
};

// get voucher/discount code
NBL_v1.requestToGetRewardVoucher = async ({ rewardId, title }) => {
    try {
        if (!rewardId || !NBL_v1?.customer?.id || !NBL_v1.customer?.config?.id) {
            throw new Error("Something went wrong");
        }

        const response = await fetch(
            `${NBL_v1.appConfig.appUrl}/api/get-reward-voucher`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    shop: Shopify.shop,
                    customerId: NBL_v1?.customer?.id || null,
                    rewardId: rewardId,
                    title: title,
                    customerIndex: NBL_v1.customer?.config?.id || null
                }),
                signal: AbortSignal.timeout(6000)
            }
        );

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }

        const data = await response.json();
        const voucher = data?.rewardVoucher;

        if (voucher) {
            NBL_v1.bus.emit('notify:info:claim:success', { response: data, voucher });
        } else {
            throw new Error("Something went wrong. Please try again later.");
        }
    } catch (error) {
        NBL_v1.bus.emit('notify:info:claim:error', {
            error: error
        });
    }
}


/* =====================================================
   NAVIGATION CONTROLLER
===================================================== */

// Set active navigation & tabs
NBL_v1.setActiveNavigation = (activeNav = "home") => {
    const syncActiveState = (items, dataKey) => {
        items().forEach(item => {
            const isActive = item.dataset[dataKey] === activeNav;
            item.classList.toggle("active", isActive);
        });
    };

    syncActiveState(NBL_v1.getNavItems, "nav");
    syncActiveState(NBL_v1.getTabItems, "tab");
};


/* =====================================================
   EVENT BUS HANDLERS
===================================================== */

// Widget open handler
NBL_v1.bus.on("event:click", ({ target }) => {
    const isOpenButton = NBL_v1.getTargetElement(target, "nbl-widget-open-button-v1");
    if (!isOpenButton) return;

    NBL_v1.toggleWidget();
});


// Widget close handler
NBL_v1.bus.on("event:click", ({ target }) => {
    const isCloseButton = NBL_v1.getTargetElement(target, "nbl-widget-close-button-v1");
    if (!isCloseButton) return;

    NBL_v1.closeWidget();
});

// Active Reward Notify
NBL_v1.bus.on("event:click", ({ target }) => {
    const item = NBL_v1.getTargetElement(target, "nbl-hta-reward-item-v1");
    if (!item) return;

    const { voucher } = item.dataset;
    console.log(voucher)

    NBL_v1.bus.emit('notify:reward:open', { code: voucher })
});

// show reward handler
NBL_v1.bus.on("event:click", ({ target }) => {
    const el = NBL_v1.getTargetElement(target, "nbl-reward-item-v1");
    if (!el) return;

    if (el.classList.contains("active")) {
        const rewardId = Number(el.dataset?.rewardId)
        const title = el.dataset?.title;
        const reward = NBL_v1.appConfig?.rewards?.find(r => r.id === rewardId)
        NBL_v1.bus.emit('notify:info:open', {
            payload: {
                text: `Spend ${reward?.pointsCost} points for this reward?`,
                claim: true,
                data: {
                    reward: reward,
                    title: title
                }
            }
        });
    } else {
        NBL_v1.bus.emit('notify:info:open', {
            payload: {
                text: 'Insufficient point balance'
            }
        });
    }
});


// Navigation handler
NBL_v1.bus.on("event:click", ({ target }) => {
    const navElement = NBL_v1.getTargetElement(target, "nbl-nav-item-v1") || NBL_v1.getTargetElement(target, "nbl-home-nav-itm-v1");

    if (!navElement) return;
    const activeNav = navElement.dataset.nav;
    if (!activeNav) return;

    NBL_v1.setActiveNavigation(activeNav);
});

// Earn point notification
NBL_v1.bus.on("event:click", ({ target }) => {
    const el = NBL_v1.getTargetElement(target, "nbl-points-item-v1");

    if (!el) return;
    NBL_v1.bus.emit('notify:info:open', {
        payload: {
            text: el?.dataset?.label
        }
    });
});


// UI render: update points
NBL_v1.uiRender.pointsUpdate = () => {
    let els = NBL_v1.getPointsElements();
    if (els) {
        els.forEach(el => el.innerHTML = Intl.NumberFormat().format(Number(NBL_v1.points || 0)))
    }
}


// Points update
NBL_v1.bus.on('points:update', (points) => {
    NBL_v1.points = points;
    NBL_v1.uiRender.pointsUpdate();
});

// Claim start and processing
NBL_v1.bus.on('notify:info:claim:start', ({ data }) => {
    const reward = data?.reward || null;

    if (!reward || !reward?.id) return;
    NBL_v1.requestToGetRewardVoucher({
        rewardId: reward?.id,
        title: data?.title
    })
});



NBL_v1.bus.on('notify:info:claim:success', (data) => {
    console.log("redeem response", data)
    let points = data?.response?.points;

    points = Number(points);

    if (!isNaN(points)) {
        NBL_v1.bus.emit('points:update', points);
        NBL_v1.tab.renderRewardList();
    }
});
