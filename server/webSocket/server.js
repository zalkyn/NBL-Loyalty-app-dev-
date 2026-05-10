// server/utils/socket.server.js
import { getIO } from "./socket.js";

// ─────────────────────────────────────────────
//  Event Types
// ─────────────────────────────────────────────

/**
 * All Socket.IO event names used across the app.
 * Always use these constants instead of raw strings
 * to avoid typos and make refactoring easier.
 *
 * @enum {string}
 */
export const SOCKET_EVENTS = {
    LOYALTY_UPDATE: "loyalty_update",
    POINTS_UPDATE: "loyalty_points_update",
    TIER_UPDATE: "loyalty_tier_update",
    REWARD_UNLOCKED: "loyalty_reward_unlocked",
    NOTIFICATION: "loyalty_notification",
};

// ─────────────────────────────────────────────
//  Core Senders (internal)
// ─────────────────────────────────────────────

/**
 * Emits a Socket.IO event to a single customer's room.
 * Silently skips if the customer is offline.
 *
 * @param {string | number} customerId  - Shopify customer ID
 * @param {string}          event       - Socket event name (use SOCKET_EVENTS)
 * @param {object}          payload     - Data to send
 * @returns {boolean} `true` if sent, `false` if customer was offline
 */
const sendToCustomer = (customerId, event, payload) => {
    if (!customerId) return false;

    const io = getIO();
    const roomName = `cust_${customerId}`;
    const room = io.sockets.adapter.rooms.get(roomName);
    const isOnline = room && room.size > 0;

    if (!isOnline) {
        console.log(`⚠️  [Socket] Customer ${customerId} offline — [${event}] skipped.`);
        return false;
    }

    io.to(roomName).emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
    });

    console.log(`📤 [Socket] [${event}] → customer: ${customerId}`);
    return true;
};

/**
 * Broadcasts a Socket.IO event to ALL currently connected customers.
 * Customers who are offline at the time will not receive it.
 *
 * @param {string} event   - Socket event name (use SOCKET_EVENTS)
 * @param {object} payload - Data to send
 * @returns {void}
 */
const broadcastToAll = (event, payload) => {
    const io = getIO();

    io.emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
    });

    console.log(`📢 [Socket] [${event}] broadcasted to all connected customers.`);
};

// ─────────────────────────────────────────────
//  Single Customer — Public API
// ─────────────────────────────────────────────

/**
 * Send a general loyalty update to a specific customer.
 *
 * @param {string | number} customerId
 * @param {{ title: string, message: string, [key: string]: any }} payload
 * @returns {boolean}
 */
export const sendLoyaltyUpdate = (customerId, payload) =>
    sendToCustomer(customerId, SOCKET_EVENTS.LOYALTY_UPDATE, payload);

/**
 * Notify a customer about their updated points balance.
 *
 * @param {string | number} customerId
 * @param {{ points: number, totalPoints: number, [key: string]: any }} payload
 * @returns {boolean}
 */
export const sendPointsUpdate = (customerId, payload) =>
    sendToCustomer(customerId, SOCKET_EVENTS.POINTS_UPDATE, payload);

/**
 * Notify a customer that their loyalty tier has changed.
 *
 * @param {string | number} customerId
 * @param {{ oldTier: string, newTier: string, [key: string]: any }} payload
 * @returns {boolean}
 */
export const sendTierUpdate = (customerId, payload) =>
    sendToCustomer(customerId, SOCKET_EVENTS.TIER_UPDATE, payload);

/**
 * Notify a customer that they have unlocked a new reward.
 *
 * @param {string | number} customerId
 * @param {{ rewardName: string, code?: string, [key: string]: any }} payload
 * @returns {boolean}
 */
export const sendRewardUnlocked = (customerId, payload) =>
    sendToCustomer(customerId, SOCKET_EVENTS.REWARD_UNLOCKED, payload);

/**
 * Send a general notification to a specific customer.
 *
 * @param {string | number} customerId
 * @param {{ title: string, message: string, [key: string]: any }} payload
 * @returns {boolean}
 */
export const sendNotification = (customerId, payload) =>
    sendToCustomer(customerId, SOCKET_EVENTS.NOTIFICATION, payload);

// ─────────────────────────────────────────────
//  Broadcast (All Customers) — Public API
// ─────────────────────────────────────────────

/**
 * Broadcast a general loyalty update to all connected customers.
 *
 * @param {{ title: string, message: string, [key: string]: any }} payload
 * @returns {void}
 */
export const broadcastLoyaltyUpdate = (payload) =>
    broadcastToAll(SOCKET_EVENTS.LOYALTY_UPDATE, payload);

/**
 * Broadcast a points update to all connected customers.
 *
 * @param {{ points: number, totalPoints: number, [key: string]: any }} payload
 * @returns {void}
 */
export const broadcastPointsUpdate = (payload) =>
    broadcastToAll(SOCKET_EVENTS.POINTS_UPDATE, payload);

/**
 * Broadcast a tier update to all connected customers.
 *
 * @param {{ oldTier: string, newTier: string, [key: string]: any }} payload
 * @returns {void}
 */
export const broadcastTierUpdate = (payload) =>
    broadcastToAll(SOCKET_EVENTS.TIER_UPDATE, payload);

/**
 * Broadcast a reward unlock event to all connected customers.
 *
 * @param {{ rewardName: string, code?: string, [key: string]: any }} payload
 * @returns {void}
 */
export const broadcastRewardUnlocked = (payload) =>
    broadcastToAll(SOCKET_EVENTS.REWARD_UNLOCKED, payload);

/**
 * Broadcast a general notification to all connected customers.
 *
 * @param {{ title: string, message: string, [key: string]: any }} payload
 * @returns {void}
 */
export const broadcastNotification = (payload) =>
    broadcastToAll(SOCKET_EVENTS.NOTIFICATION, payload);