import { logger } from "../utils/logger.js";
import syncAppConfig from "../controller/metafieldsSync/syncAppConfig.js"

export default async function afterAuthSetup({ admin }) {
    try {
        await syncAppConfig(admin);
    } catch (error) {
        logger.error("## Error in afterAuthSetup:", error);
    }
}