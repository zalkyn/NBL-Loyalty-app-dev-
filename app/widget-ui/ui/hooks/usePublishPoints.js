// =============================================================================
// app/widget-ui/ui/hooks/usePublishPoints.js
// Public points API for the merchant's own theme code — documented on the
// admin Setup Guide page. Keeps three things current whenever the widget's
// points or membership change (claim, resync, auto-enrol, join):
//
//   1. window.NBL_v1.points / .isMember / .isLoggedIn
//   2. textContent of every [data-nbl-points] element in the DOCUMENT
//      (the "Loyalty points" app block and the Setup Guide's Liquid snippet
//      both render one, server-side, with the value at page load — this is
//      what makes them update live without a reload)
//   3. a `nbl:points-updated` CustomEvent on `document`, detail
//      { points, isMember, isLoggedIn }, for anything custom
//
// Numbers are written with the same formatNumber() the widget header uses,
// so the page and the widget always show the same figure.
//
// This touches the light DOM on purpose (it's the merchant's page, outside
// our shadow root) but only ever sets textContent on elements the merchant
// explicitly opted in with the attribute — never markup, never anything else.
// =============================================================================

import { useEffect } from 'preact/hooks';
import { formatNumber } from '../utils.js';

export function usePublishPoints(points, isMember, isLoggedIn) {
    useEffect(function () {
        var value = Number(points) || 0;
        var ns = (window.NBL_v1 = window.NBL_v1 || {});
        ns.points = value;
        ns.isMember = !!isMember;
        ns.isLoggedIn = !!isLoggedIn;

        var formatted = formatNumber(value);
        var els = document.querySelectorAll('[data-nbl-points]');
        for (var i = 0; i < els.length; i++) {
            if (els[i].textContent !== formatted) els[i].textContent = formatted;
        }

        var detail = { points: value, isMember: !!isMember, isLoggedIn: !!isLoggedIn };
        var evt;
        try {
            evt = new CustomEvent('nbl:points-updated', { detail: detail });
        } catch (e) {
            // Very old browsers without the CustomEvent constructor.
            evt = document.createEvent('CustomEvent');
            evt.initCustomEvent('nbl:points-updated', false, false, detail);
        }
        document.dispatchEvent(evt);
    }, [points, isMember, isLoggedIn]);
}
