/**
 * @file dev-config/version-tracking/_loader.server.js
 * @description Loader for the Version Tracking page — see route.jsx's own
 * file comment for the page's overall purpose. Customer sync (bulk and
 * single) moved out to its own page — see dev-config/customer-sync/.
 */

import { authenticate } from "shopify-server";

import listConfigUpdateVersions from "@controller/configUpdateVersion/listConfigUpdateVersions";
import { loadCustomizeData } from "app/layout/customize/_loader.server.js";
import { buildInitialWidgetConfig } from "app/layout/customize/constants/cssVarsConfig.js";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const [{ versions, totalCustomers }, customizeData] = await Promise.all([
        listConfigUpdateVersions({ shop: session.shop, sessionId: session.id }),
        // Read-only — the actual "off/banner/auto" setting lives on the
        // Customize page (see cssVarsConfig.js's WIDGET_CONFIG_SECTIONS
        // "resync" section for why it's kept there, not here: it's a
        // real merchant-facing behavior setting, this page is
        // developer-only trigger/test tools). Shown here purely so a
        // developer testing rollout doesn't have to tab-switch to check
        // which mode is currently live.
        loadCustomizeData(session.shop),
    ]);
    const updateMode = buildInitialWidgetConfig(customizeData.savedWidgetConfig).resync.updateMode;

    return { versions, totalCustomers, updateMode };
};
