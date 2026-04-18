window.addEventListener("click", function (event) {
    // target of the click event
    const target = event.target;

    NBL_v1.bus.emit("event:global", {
        event, target
    })

    // Check if the clicked element is a loyalty widget trigger
    const widgetToggleButton = target.classList.contains("nbl-widget-open-btn-v1") ? target : target.closest(".nbl-widget-open-btn-v1");
    if (widgetToggleButton) {
        // Toggle the loyalty widget
        NBL_v1.bus.emit("event:widgetToggle", {
            event, target
        })
    }

    // Check if the clicked element is a loyalty widget close button
    const widgetCloseButton = target.classList.contains("nbl-widget-close-btn") ? target : target.closest(".nbl-widget-close-btn");
    if (widgetCloseButton) {
        // Close the loyalty widget
        NBL_v1.bus.emit("event:widgetClose", {
            event, target
        })
    }
});
