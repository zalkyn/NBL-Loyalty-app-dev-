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
// so the page and the widget always show the same figure. An element that
// already shows the right number (Liquid renders it with thousands
// separators at page load) is left alone, so it doesn't visibly reformat
// as the widget loads; it's rewritten only when the number itself changes.
//
// This touches the light DOM on purpose (it's the merchant's page, outside
// our shadow root) but only ever sets textContent on elements the merchant
// explicitly opted in with the attribute — never markup, never anything else.
// =============================================================================

import { useEffect } from 'preact/hooks';
import { formatNumber } from '../utils.js';

// "5,180", "5.180", "5 180" and "5180" all read as 5180 — only the
// grouping differs. A minus sign is kept so -50 never matches 50.
function sameNumber(text, value) {
    var digits = String(text || '').replace(/[^0-9-]/g, '');
    return digits !== '' && digits !== '-' && Number(digits) === value;
}

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
            if (sameNumber(els[i].textContent, value)) continue;
            els[i].textContent = formatted;
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
