
// Opens the loyalty widget by adding the "open" class to the container
NBL_v1.openWidget = function () {
    const widgetContainer = document.querySelector(".nbl-widget-container-v1");
    if (widgetContainer) {
        widgetContainer.classList.add("open");
    }
};

// Closes the loyalty widget by removing the "open" class from the container
NBL_v1.closeWidget = function () {
    const widgetContainer = document.querySelector(".nbl-widget-container-v1");
    if (widgetContainer) {
        widgetContainer.classList.remove("open");
    }
};

// Toggles the loyalty widget open or closed by toggling the "open" class on the container
NBL_v1.toggleWidget = function () {
    const widgetContainer = document.querySelector(".nbl-widget-container-v1");
    if (widgetContainer) {
        widgetContainer.classList.toggle("open");
    }
};


NBL_v1.requestToJoinProgram = async () => {
    try {
        const res = await fetch(`${NBL_v1.appConfig.appUrl}/api/join-our-program`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shop: Shopify.shop,
                customerId: NBL_v1?.customer?.id || 123
            }),
            signal: AbortSignal.timeout(6000)   // prevent hanging
        });

        if (!res.ok) throw new Error(res.status);

        const responseJson = await res.json();
        console.log("## Join program response", responseJson)
    } catch (error) {
        console.log("## Request to join our program error", error)
    }
}



// Event bus listen

NBL_v1.bus.on("event:widgetToggle", (event, target) => {
    NBL_v1.toggleWidget()
})

NBL_v1.bus.on("event:widgetClose", (event, target) => {
    NBL_v1.closeWidget()
})