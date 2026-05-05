
// loyalty-global.js
window.NBL_v1 = window.NBL_v1 || {};


NBL_v1.bus.on("dom:loaded", (event) => {
    const loyaltyTriggerButton = event.target.querySelector(".nbl-wo-wrapper-v1");
    if (loyaltyTriggerButton) loyaltyTriggerButton.classList.remove("nbl-d-none-v1");
})