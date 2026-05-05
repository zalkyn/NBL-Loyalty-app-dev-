window.addEventListener("click", function (event) {
    // target of the click event
    const target = event.target;

    NBL_v1.bus.emit("event:click", {
        event, target: event.target
    })
});


document.addEventListener("DOMContentLoaded", function (event) {
    NBL_v1.bus.emit("dom:loaded", event);
    NBL_v1.uiRender.pointsUpdate();
})
