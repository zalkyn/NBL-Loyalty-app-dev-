/**
 * @file app.prize-claims.jsx
 * @description Physical Prize Claims management page — server-side paginated.
 *
 * Architecture:
 *   - All filtering, sorting, and pagination happen in the loader (DB-level).
 *   - URL search params are the single source of truth for all UI state.
 *   - Stats counts are fetched in a separate, unfiltered query so tab badges
 *     always reflect total reality, not the current filter slice.
 *   - Optimistic UI: action results are merged into loaderData client-side
 *     without a full page reload, keeping the UX snappy.
 *
 * URL param schema:
 *   ?page=1&perPage=10&status=ALL&sortBy=date_desc&dateFrom=&dateTo=
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
    useActionData,
    useLoaderData,
    useSubmit,
    useNavigation,
    useSearchParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import createTransaction from "app/controller/transaction/createTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";
import Pagination from "@app/components/pagination/Pagination";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATUSES = ["ALL", "NEW", "PENDING", "FULFILLED", "COMPLETED", "CANCELLED"];
const VALID_SORT_OPTIONS = ["date_desc", "date_asc", "points_desc", "points_asc"];
const VALID_PER_PAGE = [5, 10, 25, 50];
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 50;

const STATUS_CONFIG = {
    PENDING: { label: "Pending", tone: "warning", icon: "🕐" },
    FULFILLED: { label: "Fulfilled", tone: "info", icon: "📦" },
    COMPLETED: { label: "Completed", tone: "success", icon: "✅" },
    CANCELLED: { label: "Cancelled", tone: "critical", icon: "❌" },
};

const FILTER_TABS = [
    { value: "ALL", label: "All" },
    { value: "NEW", label: "New" },
    { value: "PENDING", label: "Pending" },
    { value: "FULFILLED", label: "Fulfilled" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
];

const SORT_OPTIONS = [
    { value: "date_desc", label: "Newest first" },
    { value: "date_asc", label: "Oldest first" },
    { value: "points_desc", label: "Points: high to low" },
    { value: "points_asc", label: "Points: low to high" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
    });
}

/** Safely parse a positive integer from a URL param, falling back to `fallback`. */
function parseIntParam(value, fallback, min = 1, max = Infinity) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return n;
}

/** Build a Prisma `where` clause from validated loader params. */
function buildWhere(sessionId, { status, dateFrom, dateTo, newIds }) {
    const where = { prize: { sessionId } };

    if (status === "NEW") {
        where.id = { in: newIds };
    } else if (status !== "ALL") {
        where.status = status;
    }

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
    }

    return where;
}

/** Build a Prisma `orderBy` clause from the sortBy param. */
function buildOrderBy(sortBy) {
    switch (sortBy) {
        case "date_asc": return { createdAt: "asc" };
        case "points_desc": return { pointsCost: "desc" };
        case "points_asc": return { pointsCost: "asc" };
        default: return { createdAt: "desc" };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);

    // ── Validate & sanitise URL params ────────────────────────────────────────
    const rawStatus = url.searchParams.get("status") ?? "ALL";
    const rawSort = url.searchParams.get("sortBy") ?? "date_desc";
    const rawDateFrom = url.searchParams.get("dateFrom") ?? "";
    const rawDateTo = url.searchParams.get("dateTo") ?? "";
    const rawPage = url.searchParams.get("page") ?? "1";
    const rawPerPage = url.searchParams.get("perPage") ?? String(DEFAULT_PER_PAGE);

    const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : "ALL";
    const sortBy = VALID_SORT_OPTIONS.includes(rawSort) ? rawSort : "date_desc";
    const dateFrom = rawDateFrom.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDateFrom : "";
    const dateTo = rawDateTo.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDateTo : "";
    const perPage = parseIntParam(rawPerPage, DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);

    try {
        // ── 1. Stats query — always unfiltered for accurate tab counts ─────────
        const [allClaims, newClaimsRaw] = await Promise.all([
            prisma.physicalPrizeClaim.groupBy({
                by: ["status"],
                where: { prize: { sessionId: session.id } },
                _count: { _all: true },
            }),
            prisma.physicalPrizeClaim.findMany({
                where: { prize: { sessionId: session.id }, isSeenByAdmin: false },
                select: { id: true },
            }),
        ]);

        const newIds = newClaimsRaw.map((c) => c.id);

        // Mark all new claims as seen on first visit
        if (newIds.length > 0) {
            await prisma.physicalPrizeClaim.updateMany({
                where: { id: { in: newIds } },
                data: { isSeenByAdmin: true },
            });
        }

        const countByStatus = Object.fromEntries(
            allClaims.map(({ status: s, _count }) => [s, _count._all])
        );
        const stats = {
            total: Object.values(countByStatus).reduce((a, b) => a + b, 0),
            new: newIds.length,
            pending: countByStatus.PENDING ?? 0,
            fulfilled: countByStatus.FULFILLED ?? 0,
            completed: countByStatus.COMPLETED ?? 0,
            cancelled: countByStatus.CANCELLED ?? 0,
        };

        // ── 2. Data query — filtered + sorted + paginated ─────────────────────
        const where = buildWhere(session.id, { status, dateFrom, dateTo, newIds });
        const orderBy = buildOrderBy(sortBy);

        const [totalItems, claims] = await Promise.all([
            prisma.physicalPrizeClaim.count({ where }),
            prisma.physicalPrizeClaim.findMany({
                where,
                orderBy,
                skip: (Math.max(1, parseIntParam(rawPage, 1)) - 1) * perPage,
                take: perPage,
                include: {
                    prize: {
                        select: { id: true, title: true, imageUrl: true, productValue: true },
                    },
                    customer: {
                        select: {
                            id: true, shopifyId: true, name: true,
                            firstName: true, lastName: true, email: true, points: true,
                        },
                    },
                },
            }),
        ]);

        const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
        // Clamp page to valid range after we know totalPages
        const page = parseIntParam(rawPage, 1, 1, totalPages);

        // Tag claims that were new on this visit (before we marked them seen)
        const newIdSet = new Set(newIds);
        const claimsWithNewFlag = claims.map((c) => ({ ...c, _isNew: newIdSet.has(c.id) }));

        return {
            claims: claimsWithNewFlag,
            stats,
            newIds,          // sent to client for ref tracking
            pagination: { page, perPage, totalItems, totalPages },
        };

    } catch (err) {
        console.error("[PrizeClaims Loader]", err);
        // Return safe empty state — don't crash the page
        return {
            claims: [],
            stats: { total: 0, new: 0, pending: 0, fulfilled: 0, completed: 0, cancelled: 0 },
            newIds: [],
            pagination: { page: 1, perPage, totalItems: 0, totalPages: 1 },
            loaderError: "Failed to load claims. Please refresh.",
        };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    /** Fetch + verify a claim belongs to this session. */
    const getVerifiedClaim = async (id) => {
        const parsed = parseInt(id, 10);
        if (!Number.isFinite(parsed)) return null;

        const claim = await prisma.physicalPrizeClaim.findFirst({
            where: { id: parsed },
            include: {
                prize: { select: { sessionId: true, title: true } },
                customer: { select: { id: true, shopifyId: true, points: true } },
            },
        });
        if (!claim || claim.prize.sessionId !== session.id) return null;
        return claim;
    };

    // ── MARK CLAIM SEEN + VIEWED ─────────────────────────────────────────────
    if (submitType === "markClaimSeen") {
        const claimId = formData.get("claimId");
        if (!claimId) return { message: "Claim ID is required.", status: "error", submitType };

        try {
            const claim = await getVerifiedClaim(claimId);
            if (!claim) return { message: "Claim not found or access denied.", status: "error", submitType };

            const now = new Date();
            const isFirstView = !claim.viewedByAdmin;

            await prisma.physicalPrizeClaim.update({
                where: { id: parseInt(claimId, 10) },
                data: {
                    isSeenByAdmin: true,
                    viewedByAdmin: true,
                    // Only stamp viewedAt on the very first view
                    ...(isFirstView ? { viewedAt: now } : {}),
                },
            });

            return {
                status: "success", submitType,
                claimId: parseInt(claimId, 10),
                viewedAt: isFirstView ? now.toISOString() : (claim.viewedAt?.toISOString() ?? null),
            };
        } catch (err) {
            console.error("[markClaimSeen]", err);
            return { message: err.message || "Failed to mark seen.", status: "error", submitType };
        }
    }

    // ── UPDATE STATUS ─────────────────────────────────────────────────────────
    if (submitType === "updateClaimStatus") {
        const claimId = formData.get("claimId");
        const newStatus = formData.get("status");
        const trackingInfo = formData.get("trackingInfo") || null;

        if (!claimId) return { message: "Claim ID is required.", status: "error", submitType };
        if (!["FULFILLED", "COMPLETED", "CANCELLED"].includes(newStatus))
            return { message: "Invalid status.", status: "error", submitType };

        try {
            const claim = await getVerifiedClaim(claimId);
            if (!claim) return { message: "Claim not found or access denied.", status: "error", submitType };
            if (claim.status === newStatus) return { message: "Claim is already in that status.", status: "error", submitType };

            const claimIdInt = parseInt(claimId, 10);

            // CANCELLED — refund points
            if (newStatus === "CANCELLED") {
                const pointsCost = Math.abs(Number(claim.pointsCost) || 0);

                await prisma.$transaction(async (tx) => {
                    await tx.physicalPrizeClaim.update({
                        where: { id: claimIdInt },
                        data: { status: "CANCELLED", fulfilledAt: null, completedAt: null },
                    });
                    await tx.customer.update({
                        where: { id: claim.customer.id },
                        data: { points: { increment: pointsCost } },
                    });
                });

                const updated = await prisma.customer.findUnique({
                    where: { id: claim.customer.id }, select: { points: true },
                });

                await createTransaction({
                    customerId: claim.customer.id, type: "ADJUST",
                    reason: `Points refunded — prize cancelled: ${claim.prize.title}`,
                    activity: `+${pointsCost} points refunded for cancelled prize: ${claim.prize.title}`,
                    points: pointsCost,
                    balanceAfter: updated?.points ?? 0,
                    status: "COMPLETED",
                }, session);

                await syncCustomerConfig(admin, claim.customer.shopifyId);

                return {
                    message: `Claim cancelled. ${Number(pointsCost).toLocaleString()} points refunded.`,
                    status: "success", submitType,
                    claimId: claimIdInt, newStatus: "CANCELLED",
                };
            }

            // FULFILLED — only from PENDING
            if (newStatus === "FULFILLED") {
                if (claim.status !== "PENDING")
                    return { message: "Only pending claims can be marked as fulfilled.", status: "error", submitType };

                await prisma.physicalPrizeClaim.update({
                    where: { id: claimIdInt },
                    data: {
                        status: "FULFILLED",
                        fulfilledAt: new Date(),
                        ...(trackingInfo ? { trackingInfo } : {}),
                    },
                });

                const customer = await prisma.customer.findUnique({
                    where: { id: claim.customer.id }, select: { points: true },
                });
                await createTransaction({
                    customerId: claim.customer.id, type: "ADJUST",
                    reason: `Prize claim fulfilled: ${claim.prize.title}`,
                    activity: `Prize "${claim.prize.title}" marked as fulfilled — no points changed`,
                    points: 0,
                    balanceAfter: customer?.points ?? 0,
                    status: "COMPLETED",
                }, session);

                await syncCustomerConfig(admin, claim.customer.shopifyId);

                return {
                    message: "Claim marked as fulfilled.",
                    status: "success", submitType,
                    claimId: claimIdInt, newStatus: "FULFILLED", trackingInfo,
                };
            }

            // COMPLETED — only from FULFILLED
            if (newStatus === "COMPLETED") {
                if (claim.status !== "FULFILLED")
                    return { message: "Only fulfilled claims can be marked as completed.", status: "error", submitType };

                await prisma.physicalPrizeClaim.update({
                    where: { id: claimIdInt },
                    data: { status: "COMPLETED", completedAt: new Date() },
                });

                const customer = await prisma.customer.findUnique({
                    where: { id: claim.customer.id }, select: { points: true },
                });
                await createTransaction({
                    customerId: claim.customer.id, type: "ADJUST",
                    reason: `Prize claim completed: ${claim.prize.title}`,
                    activity: `Prize "${claim.prize.title}" marked as completed — delivery confirmed`,
                    points: 0,
                    balanceAfter: customer?.points ?? 0,
                    status: "COMPLETED",
                }, session);

                await syncCustomerConfig(admin, claim.customer.shopifyId);

                return {
                    message: "Claim marked as completed.",
                    status: "success", submitType,
                    claimId: claimIdInt, newStatus: "COMPLETED",
                };
            }

        } catch (err) {
            console.error("[updateClaimStatus]", err);
            return { message: err.message || "Failed to update claim.", status: "error", submitType };
        }
    }

    // ── REVERT ────────────────────────────────────────────────────────────────
    if (submitType === "revertClaim") {
        const claimId = formData.get("claimId");
        if (!claimId) return { message: "Claim ID is required.", status: "error", submitType };

        try {
            const claim = await getVerifiedClaim(claimId);
            const claimIdInt = parseInt(claimId, 10);

            if (!claim) return { message: "Claim not found or access denied.", status: "error", submitType };

            const logRevert = async (tx, reason, activity) => {
                const customer = await tx.customer.findUnique({
                    where: { id: claim.customer.id }, select: { points: true },
                });
                await createTransaction({
                    customerId: claim.customer.id, type: "ADJUST",
                    reason, activity, points: 0,
                    balanceAfter: customer?.points ?? 0, status: "COMPLETED",
                }, session);
                await syncCustomerConfig(admin, claim.customer.shopifyId);
            };

            // COMPLETED → FULFILLED
            if (claim.status === "COMPLETED") {
                await prisma.$transaction(async (tx) => {
                    await tx.physicalPrizeClaim.update({
                        where: { id: claimIdInt },
                        data: { status: "FULFILLED", completedAt: null },
                    });
                    await logRevert(
                        tx,
                        `Prize claim reverted to fulfilled: ${claim.prize.title}`,
                        `Prize "${claim.prize.title}" reverted from completed → fulfilled — no points changed`,
                    );
                });
                return { message: "Claim reverted to fulfilled.", status: "success", submitType, claimId: claimIdInt, newStatus: "FULFILLED" };
            }

            // FULFILLED → PENDING
            if (claim.status === "FULFILLED") {
                await prisma.$transaction(async (tx) => {
                    await tx.physicalPrizeClaim.update({
                        where: { id: claimIdInt },
                        data: { status: "PENDING", fulfilledAt: null, trackingInfo: null },
                    });
                    await logRevert(
                        tx,
                        `Prize claim reverted to pending: ${claim.prize.title}`,
                        `Prize "${claim.prize.title}" reverted from fulfilled → pending — no points changed`,
                    );
                });
                return { message: "Claim reverted to pending.", status: "success", submitType, claimId: claimIdInt, newStatus: "PENDING" };
            }

            // CANCELLED → PENDING (re-deduct points)
            if (claim.status === "CANCELLED") {
                const pointsCost = Math.abs(Number(claim.pointsCost) || 0);

                if (claim.customer.points < pointsCost)
                    return {
                        message: `Not enough points. Required: ${pointsCost.toLocaleString()}, Available: ${claim.customer.points.toLocaleString()}.`,
                        status: "error", submitType,
                    };

                await prisma.$transaction(async (tx) => {
                    await tx.physicalPrizeClaim.update({
                        where: { id: claimIdInt },
                        data: { status: "PENDING", fulfilledAt: null, completedAt: null, trackingInfo: null },
                    });
                    await tx.customer.update({
                        where: { id: claim.customer.id },
                        data: { points: { decrement: pointsCost } },
                    });
                });

                const updated = await prisma.customer.findUnique({
                    where: { id: claim.customer.id }, select: { points: true },
                });
                await createTransaction({
                    customerId: claim.customer.id, type: "ADJUST",
                    reason: `Points re-deducted — prize reinstated: ${claim.prize.title}`,
                    activity: `-${pointsCost} points re-deducted for reinstated prize: ${claim.prize.title}`,
                    points: -pointsCost,
                    balanceAfter: updated?.points ?? 0,
                    status: "COMPLETED",
                }, session);
                await syncCustomerConfig(admin, claim.customer.shopifyId);

                return {
                    message: `Claim reverted to pending. ${Number(pointsCost).toLocaleString()} points re-deducted.`,
                    status: "success", submitType,
                    claimId: claimIdInt, newStatus: "PENDING",
                };
            }

            return { message: "Cannot revert this claim.", status: "error", submitType };

        } catch (err) {
            console.error("[revertClaim]", err);
            return { message: err.message || "Failed to revert claim.", status: "error", submitType };
        }
    }

    // ── SAVE ADMIN NOTE ───────────────────────────────────────────────────────
    if (submitType === "saveAdminNote") {
        const claimId = formData.get("claimId");
        const adminNote = formData.get("adminNote") ?? "";

        if (!claimId) return { message: "Claim ID is required.", status: "error", submitType };

        try {
            const claim = await getVerifiedClaim(claimId);
            if (!claim) return { message: "Claim not found or access denied.", status: "error", submitType };

            const trimmed = adminNote.trim() || null;

            await prisma.physicalPrizeClaim.update({
                where: { id: parseInt(claimId, 10) },
                data: { adminNote: trimmed },
            });

            return {
                message: "Note saved.",
                status: "success", submitType,
                claimId: parseInt(claimId, 10), adminNote: trimmed,
            };

        } catch (err) {
            console.error("[saveAdminNote]", err);
            return { message: err.message || "Failed to save note.", status: "error", submitType };
        }
    }

    // ── BULK ACTION ───────────────────────────────────────────────────────────
    if (submitType === "bulkAction") {
        const bulkAction = formData.get("bulkAction");
        let claimIds;

        try {
            claimIds = JSON.parse(formData.get("claimIds") || "[]");
            if (!Array.isArray(claimIds)) throw new Error();
        } catch {
            return { message: "Invalid claim IDs.", status: "error", submitType };
        }

        if (!claimIds.length) return { message: "No claims selected.", status: "error", submitType };
        if (!["FULFILLED", "COMPLETED", "CANCELLED"].includes(bulkAction))
            return { message: "Invalid bulk action.", status: "error", submitType };

        try {
            const results = { success: [], failed: [] };

            for (const claimId of claimIds) {
                const claim = await getVerifiedClaim(claimId);
                const id = parseInt(claimId, 10);

                const skip =
                    !claim
                    || (bulkAction === "FULFILLED" && claim.status !== "PENDING")
                    || (bulkAction === "COMPLETED" && claim.status !== "FULFILLED")
                    || (bulkAction === "CANCELLED" && !["PENDING", "FULFILLED"].includes(claim.status));

                if (skip) { results.failed.push(id); continue; }

                if (bulkAction === "CANCELLED") {
                    const pointsCost = Math.abs(Number(claim.pointsCost) || 0);
                    await prisma.$transaction(async (tx) => {
                        await tx.physicalPrizeClaim.update({
                            where: { id },
                            data: { status: "CANCELLED", fulfilledAt: null, completedAt: null },
                        });
                        await tx.customer.update({
                            where: { id: claim.customer.id },
                            data: { points: { increment: pointsCost } },
                        });
                    });
                    const updated = await prisma.customer.findUnique({
                        where: { id: claim.customer.id }, select: { points: true },
                    });
                    await createTransaction({
                        customerId: claim.customer.id, type: "ADJUST",
                        reason: `Points refunded — prize cancelled: ${claim.prize.title}`,
                        activity: `+${pointsCost} points refunded for cancelled prize: ${claim.prize.title}`,
                        points: pointsCost,
                        balanceAfter: updated?.points ?? 0,
                        status: "COMPLETED",
                    }, session);
                    await syncCustomerConfig(admin, claim.customer.shopifyId);
                }

                if (bulkAction === "FULFILLED") {
                    await prisma.physicalPrizeClaim.update({
                        where: { id },
                        data: { status: "FULFILLED", fulfilledAt: new Date() },
                    });
                    const customer = await prisma.customer.findUnique({
                        where: { id: claim.customer.id }, select: { points: true },
                    });
                    await createTransaction({
                        customerId: claim.customer.id, type: "ADJUST",
                        reason: `Prize claim fulfilled: ${claim.prize.title}`,
                        activity: `Prize "${claim.prize.title}" marked as fulfilled (bulk) — no points changed`,
                        points: 0,
                        balanceAfter: customer?.points ?? 0,
                        status: "COMPLETED",
                    }, session);
                    await syncCustomerConfig(admin, claim.customer.shopifyId);
                }

                if (bulkAction === "COMPLETED") {
                    await prisma.physicalPrizeClaim.update({
                        where: { id },
                        data: { status: "COMPLETED", completedAt: new Date() },
                    });
                    const customer = await prisma.customer.findUnique({
                        where: { id: claim.customer.id }, select: { points: true },
                    });
                    await createTransaction({
                        customerId: claim.customer.id, type: "ADJUST",
                        reason: `Prize claim completed: ${claim.prize.title}`,
                        activity: `Prize "${claim.prize.title}" marked as completed (bulk) — delivery confirmed`,
                        points: 0,
                        balanceAfter: customer?.points ?? 0,
                        status: "COMPLETED",
                    }, session);
                    await syncCustomerConfig(admin, claim.customer.shopifyId);
                }

                results.success.push(id);
            }

            const actionLabel = { FULFILLED: "fulfilled", COMPLETED: "completed", CANCELLED: "cancelled" }[bulkAction];
            const msg = results.failed.length
                ? `${results.success.length} updated. ${results.failed.length} skipped (wrong status or not found).`
                : `${results.success.length} claim${results.success.length > 1 ? "s" : ""} ${actionLabel}.`;

            return {
                message: msg, status: "success", submitType,
                bulkAction, updatedIds: results.success, newStatus: bulkAction,
            };

        } catch (err) {
            console.error("[bulkAction]", err);
            return { message: err.message || "Bulk action failed.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PrizeClaimsPage() {
    const submit = useSubmit();
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const [searchParams, setSearchParams] = useSearchParams();

    // Modal refs
    const modalRef = useRef(null);
    const noteModalRef = useRef(null);
    const bulkModalRef = useRef(null);
    const viewModalRef = useRef(null);

    // Local UI state that doesn't need to live in the URL
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [trackingInput, setTrackingInput] = useState("");
    const [noteTarget, setNoteTarget] = useState(null);
    const [noteValue, setNoteValue] = useState("");
    const [viewTarget, setViewTarget] = useState(null);
    const [bulkAction, setBulkAction] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [newDismissed, setNewDismissed] = useState(false);

    // Track new claim IDs client-side (set on first load, mutated on view)
    const newClaimIds = useRef(new Set(loaderData?.newIds ?? []));

    // Keep the ref in sync with loader refreshes.
    // When the loader re-runs (filter/page change), newIds reflects the DB truth.
    // We subtract any IDs the user already viewed in this session so "New" badge
    // disappears immediately on view without waiting for the next loader round-trip.
    const sessionViewedIds = useRef(new Set());
    // Optimistic: track viewed IDs so the badge disappears immediately on view
    // without waiting for the loader to re-run after the markClaimSeen action.
    const [optimisticViewedIds, setOptimisticViewedIds] = useState(new Set());
    useEffect(() => {
        const freshNew = new Set(loaderData?.newIds ?? []);
        // Remove ones already viewed this session
        sessionViewedIds.current.forEach((id) => freshNew.delete(id));
        newClaimIds.current = freshNew;
    }, [loaderData]);

    // Derived URL state
    const activeTab = VALID_STATUSES.includes(searchParams.get("status")) ? searchParams.get("status") : "ALL";
    const sortBy = VALID_SORT_OPTIONS.includes(searchParams.get("sortBy")) ? searchParams.get("sortBy") : "date_desc";
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";

    // Pagination values from loader (source of truth)
    const { page: currentPage, perPage, totalItems, totalPages } = loaderData?.pagination ?? {
        page: 1, perPage: DEFAULT_PER_PAGE, totalItems: 0, totalPages: 1,
    };
    const startIndex = (currentPage - 1) * perPage;

    const claims = loaderData?.claims ?? [];
    const stats = loaderData?.stats ?? {};

    const isSubmitting = navigation.state === "submitting";
    const pendingClaimId = navigation.formData?.get("claimId");
    const pendingSubmit = navigation.formData?.get("submitType");
    const isBusy = (id) => isSubmitting && Number(pendingClaimId) === Number(id);

    // ── Search param helpers ──────────────────────────────────────────────────

    /** Update one or more search params, always resetting page to 1 unless `page` is explicitly set. */
    const updateParams = useCallback((updates, resetPage = true) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => {
                if (v === "" || v == null) next.delete(k);
                else next.set(k, String(v));
            });
            if (resetPage && !("page" in updates)) next.set("page", "1");
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const setCurrentPage = useCallback((p) => updateParams({ page: p }, false), [updateParams]);
    const setPerPage = useCallback((pp) => updateParams({ perPage: pp }), [updateParams]);
    const setActiveTab = useCallback((s) => { updateParams({ status: s }); setSelectedIds(new Set()); }, [updateParams]);
    const setSortBy = useCallback((s) => updateParams({ sortBy: s }), [updateParams]);
    const setDateFrom = useCallback((d) => updateParams({ dateFrom: d }), [updateParams]);
    const setDateTo = useCallback((d) => updateParams({ dateTo: d }), [updateParams]);

    const clearFilters = useCallback(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            ["status", "sortBy", "dateFrom", "dateTo", "page"].forEach((k) => next.delete(k));
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const hasActiveFilters = activeTab !== "ALL" || sortBy !== "date_desc" || dateFrom || dateTo;

    // ── Action data side-effects ──────────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        if (actionData.submitType === "markClaimSeen") return; // silent

        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    // ── Loader error banner ───────────────────────────────────────────────────
    // (loaderError is only set when the loader's try/catch fires)

    // ── Confirm modal ─────────────────────────────────────────────────────────
    const openConfirm = useCallback((claim, action) => {
        setConfirmTarget({ claim, action });
        setTrackingInput("");
        requestAnimationFrame(() => modalRef.current?.showOverlay());
    }, []);

    const handleConfirm = useCallback(() => {
        if (!confirmTarget) return;
        modalRef.current?.hideOverlay();
        const { claim, action } = confirmTarget;

        if (action === "REVERT") {
            submit({ submitType: "revertClaim", claimId: String(claim.id) }, { method: "post" });
        } else {
            submit({
                submitType: "updateClaimStatus",
                claimId: String(claim.id),
                status: action,
                trackingInfo: trackingInput.trim(),
            }, { method: "post" });
        }
        setConfirmTarget(null);
        setTrackingInput("");
    }, [confirmTarget, submit, trackingInput]);

    // ── Note modal ────────────────────────────────────────────────────────────
    const openNoteModal = useCallback((claim) => {
        setNoteTarget(claim);
        setNoteValue(claim.adminNote ?? "");
        requestAnimationFrame(() => noteModalRef.current?.showOverlay());
    }, []);

    const handleSaveNote = useCallback(() => {
        if (!noteTarget) return;
        noteModalRef.current?.hideOverlay();
        submit(
            { submitType: "saveAdminNote", claimId: String(noteTarget.id), adminNote: noteValue },
            { method: "post" }
        );
    }, [noteTarget, noteValue, submit]);

    // ── View modal ────────────────────────────────────────────────────────────
    const openViewModal = useCallback((claim) => {
        setViewTarget(claim);
        requestAnimationFrame(() => viewModalRef.current?.showOverlay());

        // Always mark as viewed optimistically so badge disappears immediately
        if (!claim.viewedByAdmin) {
            setOptimisticViewedIds((prev) => new Set([...prev, claim.id]));
        }
        if (newClaimIds.current.has(claim.id)) {
            newClaimIds.current.delete(claim.id);
            sessionViewedIds.current.add(claim.id); // remember across loader refreshes
            submit({ submitType: "markClaimSeen", claimId: String(claim.id) }, { method: "post" });
        } else if (!claim.viewedByAdmin) {
            // Not a "new" claim but also not yet viewed — still need to mark it
            submit({ submitType: "markClaimSeen", claimId: String(claim.id) }, { method: "post" });
        }
    }, [submit]);

    // ── Bulk modal ────────────────────────────────────────────────────────────
    const openBulkConfirm = useCallback((action) => {
        setBulkAction(action);
        requestAnimationFrame(() => bulkModalRef.current?.showOverlay());
    }, []);

    const handleBulkConfirm = useCallback(() => {
        bulkModalRef.current?.hideOverlay();
        submit(
            { submitType: "bulkAction", bulkAction, claimIds: JSON.stringify([...selectedIds]) },
            { method: "post" }
        );
        // Optimistically clear selection; loader will re-validate
        setSelectedIds(new Set());
        setBulkAction(null);
    }, [bulkAction, selectedIds, submit]);

    // ── Selection helpers ─────────────────────────────────────────────────────
    const pendingOnPage = claims.filter((c) => c.status === "PENDING");
    const fulfilledOnPage = claims.filter((c) => c.status === "FULFILLED");
    const selectablePage = [...pendingOnPage, ...fulfilledOnPage];
    const allPageSelected = selectablePage.length > 0 && selectablePage.every((c) => selectedIds.has(c.id));

    const toggleSelect = useCallback((id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAllPage = useCallback(() => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const all = selectablePage.every((c) => next.has(c.id));
            selectablePage.forEach((c) => all ? next.delete(c.id) : next.add(c.id));
            return next;
        });
    }, [selectablePage]);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    // ── Misc helpers ──────────────────────────────────────────────────────────
    const handleOpenCustomer = useCallback(async (shopifyId) => {
        try {
            await shopify.intents.invoke("edit:shopify/Customer", { value: shopifyId });
        } catch {
            shopify.toast.show("Could not open customer profile.", { isError: true });
        }
    }, [shopify]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — loader error
    // ─────────────────────────────────────────────────────────────────────────

    const renderLoaderError = () => {
        if (!loaderData?.loaderError) return null;
        return (
            <s-section>
                <s-banner tone="critical" heading="Something went wrong">
                    {loaderData.loaderError}
                </s-banner>
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — new claims banner
    // ─────────────────────────────────────────────────────────────────────────

    const renderNewBanner = () => {
        if (newDismissed || !stats.new || stats.new === 0) return null;
        return (
            <s-section>
                <s-banner
                    tone="info"
                    heading={`${stats.new} new prize request${stats.new > 1 ? "s" : ""} since your last visit`}
                    dismissible
                    onDismiss={() => setNewDismissed(true)}
                >
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text variant="bodySm">
                            {stats.new} new {stats.new > 1 ? "requests need" : "request needs"} your attention.
                        </s-text>
                        <s-button variant="plain" onClick={() => setActiveTab("NEW")}>
                            View new requests
                        </s-button>
                    </s-stack>
                </s-banner>
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — stats
    // ─────────────────────────────────────────────────────────────────────────

    const renderStats = () => (
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr 1fr 1fr" gap="base">
            {[
                { label: "Total", tone: "info", value: stats.total ?? 0, sub: "All claims" },
                { label: "New", tone: "info", value: stats.new ?? 0, sub: "Since last visit" },
                { label: "Pending", tone: "warning", value: stats.pending ?? 0, sub: "Awaiting action" },
                { label: "Fulfilled", tone: "info", value: stats.fulfilled ?? 0, sub: "Sent to customer" },
                { label: "Completed", tone: "success", value: stats.completed ?? 0, sub: "Fully delivered" },
                { label: "Cancelled", tone: "critical", value: stats.cancelled ?? 0, sub: "Points refunded" },
            ].map(({ label, tone, value, sub }) => (
                <s-box key={label} padding="base" background="base" borderWidth="base" borderColor="base" borderRadius="base">
                    <s-stack direction="block" gap="small-200">
                        <s-badge tone={tone}>{label}</s-badge>
                        <s-heading>{value}</s-heading>
                        <s-text variant="bodySm" tone="subdued">{sub}</s-text>
                    </s-stack>
                </s-box>
            ))}
        </s-grid>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — filter bar
    // ─────────────────────────────────────────────────────────────────────────

    const renderFilterBar = () => {
        const countFor = (v) => ({
            NEW: stats.new, PENDING: stats.pending, FULFILLED: stats.fulfilled,
            COMPLETED: stats.completed, CANCELLED: stats.cancelled,
        }[v] ?? stats.total ?? 0);

        return (
            <s-section>
                <s-stack direction="block" gap="base">

                    {/* Tabs */}
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text tone="subdued" variant="bodySm">Filter:</s-text>
                        {FILTER_TABS.map(({ value, label }) => (
                            <s-button
                                key={value}
                                variant={activeTab === value ? "primary" : "secondary"}
                                onClick={() => setActiveTab(value)}
                            >
                                {label} ({countFor(value)})
                                {value === "NEW" && stats.new > 0 && activeTab !== "NEW" && " 🔵"}
                            </s-button>
                        ))}
                    </s-stack>

                    {/* Date range + sort */}
                    <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                        <s-date-field
                            label="From date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.currentTarget.value)}
                        />
                        <s-date-field
                            label="To date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.currentTarget.value)}
                        />
                        <s-select
                            label="Sort by"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.currentTarget.value)}
                        >
                            {SORT_OPTIONS.map(({ value, label }) => (
                                <s-option key={value} value={value}>{label}</s-option>
                            ))}
                        </s-select>
                    </s-grid>

                    {hasActiveFilters && (
                        <s-stack direction="inline" gap="base" alignItems="center">
                            <s-button variant="plain" tone="critical" onClick={clearFilters}>
                                Clear filters
                            </s-button>
                            <s-text variant="bodySm" tone="subdued">
                                {totalItems} of {stats.total ?? 0} claims
                            </s-text>
                        </s-stack>
                    )}

                </s-stack>
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — bulk action bar
    // ─────────────────────────────────────────────────────────────────────────

    const renderBulkBar = () => {
        if (selectedIds.size === 0) return null;

        // Derive what actions apply from the current page's selected claims
        const selected = claims.filter((c) => selectedIds.has(c.id));
        const hasAnyPending = selected.some((c) => c.status === "PENDING");
        const hasAnyFulfilled = selected.some((c) => c.status === "FULFILLED");
        const hasAnyCancellable = selected.some((c) => ["PENDING", "FULFILLED"].includes(c.status));

        return (
            <s-section>
                <s-banner tone="info" heading={`${selectedIds.size} claim${selectedIds.size > 1 ? "s" : ""} selected`}>
                    <s-stack direction="inline" gap="small" alignItems="center">
                        {hasAnyPending && (
                            <s-button variant="primary" disabled={isSubmitting} onClick={() => openBulkConfirm("FULFILLED")}>
                                Mark All Fulfilled
                            </s-button>
                        )}
                        {hasAnyFulfilled && (
                            <s-button variant="primary" disabled={isSubmitting} onClick={() => openBulkConfirm("COMPLETED")}>
                                Mark All Completed
                            </s-button>
                        )}
                        {hasAnyCancellable && (
                            <s-button variant="secondary" tone="critical" disabled={isSubmitting} onClick={() => openBulkConfirm("CANCELLED")}>
                                Cancel All & Refund
                            </s-button>
                        )}
                        <s-button variant="plain" onClick={clearSelection}>
                            Clear selection
                        </s-button>
                    </s-stack>
                </s-banner>
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — table
    // ─────────────────────────────────────────────────────────────────────────

    const renderTable = () => (
        <s-section padding="none">
            <s-table>
                <s-table-header-row>
                    <s-table-header>
                        {selectablePage.length > 0 && (
                            <input
                                type="checkbox"
                                checked={allPageSelected}
                                onChange={toggleSelectAllPage}
                                title="Select all pending/fulfilled on this page"
                            />
                        )}
                    </s-table-header>
                    <s-table-header>Prize</s-table-header>
                    <s-table-header>Customer</s-table-header>
                    <s-table-header>Points Spent</s-table-header>
                    <s-table-header>Claimed On</s-table-header>
                    <s-table-header>Fulfilled On</s-table-header>
                    <s-table-header>Completed On</s-table-header>
                    <s-table-header>Status</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {claims.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="9">
                                <s-text tone="subdued">No claims found.</s-text>
                            </s-table-cell>
                        </s-table-row>
                    ) : (
                        claims.map((claim) => {
                            const sc = STATUS_CONFIG[claim.status] || STATUS_CONFIG.PENDING;
                            const busy = isBusy(claim.id);
                            const { customer, prize } = claim;
                            const fullName = customer?.name || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || "Unknown";
                            const isPending = claim.status === "PENDING";
                            const isFulfilled = claim.status === "FULFILLED";
                            const isCompleted = claim.status === "COMPLETED";
                            const isCancelled = claim.status === "CANCELLED";
                            const isSelectable = isPending || isFulfilled;
                            const isNew = newClaimIds.current.has(claim.id);

                            return (
                                <s-table-row key={claim.id}>

                                    {/* Checkbox */}
                                    <s-table-cell>
                                        {isSelectable && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(claim.id)}
                                                onChange={() => toggleSelect(claim.id)}
                                                disabled={isSubmitting}
                                            />
                                        )}
                                    </s-table-cell>

                                    {/* Prize */}
                                    <s-table-cell>
                                        <s-stack direction="inline" gap="small" alignItems="center">
                                            {prize?.imageUrl
                                                ? <s-thumbnail src={prize.imageUrl} size="small" alt={prize.title ?? "Prize"} />
                                                : <s-thumbnail alt="No image" size="small" />
                                            }
                                            <s-stack direction="block" gap="none">
                                                <s-text variant="headingSm">{prize?.title ?? "—"}</s-text>
                                                {prize?.productValue && (
                                                    <s-text tone="subdued" variant="bodySm">
                                                        Value: ${Number(prize.productValue).toLocaleString()}
                                                    </s-text>
                                                )}
                                            </s-stack>
                                        </s-stack>
                                    </s-table-cell>

                                    {/* Customer */}
                                    <s-table-cell>
                                        <s-stack direction="block" gap="none">
                                            <s-stack direction="inline" gap="small" alignItems="center">
                                                <s-text variant="headingSm">{fullName}</s-text>
                                                {customer?.shopifyId && (
                                                    <s-button variant="plain" disabled={busy} onClick={() => handleOpenCustomer(customer.shopifyId)}>
                                                        View profile
                                                    </s-button>
                                                )}
                                            </s-stack>
                                            <s-text tone="subdued" variant="bodySm">{customer?.email ?? "—"}</s-text>
                                        </s-stack>
                                    </s-table-cell>

                                    {/* Points */}
                                    <s-table-cell>
                                        <s-text variant="headingSm">
                                            {Number(claim.pointsCost).toLocaleString()} pts
                                        </s-text>
                                    </s-table-cell>

                                    {/* Claimed date */}
                                    <s-table-cell>
                                        <s-text tone="subdued" variant="bodySm">{formatDate(claim.createdAt)}</s-text>
                                    </s-table-cell>

                                    {/* Fulfilled date */}
                                    <s-table-cell>
                                        <s-text tone="subdued" variant="bodySm">{formatDate(claim.fulfilledAt)}</s-text>
                                    </s-table-cell>

                                    {/* Completed date */}
                                    <s-table-cell>
                                        <s-text tone="subdued" variant="bodySm">{formatDate(claim.completedAt)}</s-text>
                                    </s-table-cell>

                                    {/* Status */}
                                    <s-table-cell>
                                        <s-stack direction="block" gap="small-300">
                                            <s-badge tone={sc.tone}>{sc.icon} {sc.label}</s-badge>
                                            {isNew && <s-badge tone="info" size="small">New</s-badge>}
                                            {!claim.viewedByAdmin && !optimisticViewedIds.has(claim.id) && !isNew && <s-badge tone="warning" size="small">👁 Unreviewed</s-badge>}
                                            {claim.adminNote && <s-badge tone="attention" size="small">📝 Note</s-badge>}
                                        </s-stack>
                                    </s-table-cell>

                                    {/* Actions */}
                                    <s-table-cell>
                                        <s-button variant="plain" onClick={() => openViewModal(claim)}>
                                            {isNew ? "👁 View (New)" : "👁 View"}
                                        </s-button>
                                    </s-table-cell>

                                </s-table-row>
                            );
                        })
                    )}
                </s-table-body>
            </s-table>

            <s-divider />

            <s-box paddingBlockEnd="base" paddingInline="base">
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    perPage={perPage}
                    startIndex={startIndex}
                    setCurrentPage={setCurrentPage}
                    setPerPage={setPerPage}
                    label="claims"
                />
            </s-box>
        </s-section>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — confirm modal derived values
    // ─────────────────────────────────────────────────────────────────────────

    const confirmAction = confirmTarget?.action;
    const isCancelling = confirmAction === "CANCELLED";
    const isReverting = confirmAction === "REVERT";
    const isFulfilling = confirmAction === "FULFILLED";
    const isCompleting = confirmAction === "COMPLETED";
    const pts = Number(confirmTarget?.claim?.pointsCost ?? 0).toLocaleString();
    const prizeTitle = confirmTarget?.claim?.prize?.title ?? "this prize";
    const customerName = confirmTarget?.claim?.customer?.name
        || [confirmTarget?.claim?.customer?.firstName, confirmTarget?.claim?.customer?.lastName].filter(Boolean).join(" ")
        || "the customer";
    const customerPoints = Number(confirmTarget?.claim?.customer?.points ?? 0);
    const revertCost = Number(confirmTarget?.claim?.pointsCost ?? 0);
    const isCancelledRevert = confirmTarget?.claim?.status === "CANCELLED";
    const notEnoughPoints = isReverting && isCancelledRevert && customerPoints < revertCost;

    const revertLabel = confirmTarget?.claim?.status === "COMPLETED"
        ? "Revert to Fulfilled"
        : "Revert to Pending";

    const modalHeading = isCancelling ? "Cancel Prize Request"
        : isReverting ? revertLabel
            : isCompleting ? "Mark as Completed"
                : "Mark as Fulfilled";

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <s-page heading="Prize Claims" inlineSize="large">

            {/* ── Confirm modal (single) ── */}
            <s-modal
                ref={modalRef}
                id="confirm-claim-modal"
                heading={modalHeading}
                accessibilityLabel={modalHeading}
                onHide={() => { setConfirmTarget(null); setTrackingInput(""); }}
            >
                <s-stack direction="block" gap="base">
                    {isCancelling && (
                        <s-banner tone="warning" heading="Points will be refunded">
                            {pts} points will be returned to {customerName}'s account automatically.
                        </s-banner>
                    )}
                    {isReverting && isCancelledRevert && notEnoughPoints && (
                        <s-banner tone="critical" heading="Insufficient points">
                            {customerName} only has {customerPoints.toLocaleString()} pts but {revertCost.toLocaleString()} pts are needed. Cannot revert.
                        </s-banner>
                    )}
                    {isReverting && isCancelledRevert && !notEnoughPoints && (
                        <s-banner tone="warning" heading="Points will be deducted">
                            {pts} points will be deducted from {customerName}'s account again.
                        </s-banner>
                    )}
                    {isCompleting && (
                        <s-banner tone="success" heading="Final confirmation">
                            This will mark the prize as fully delivered and completed.
                        </s-banner>
                    )}
                    <s-text>
                        {isCancelling
                            ? `Are you sure you want to cancel the request for "${prizeTitle}"? Points will be refunded.`
                            : isReverting
                                ? confirmTarget?.claim?.status === "COMPLETED"
                                    ? `Revert "${prizeTitle}" back to fulfilled?`
                                    : confirmTarget?.claim?.status === "FULFILLED"
                                        ? `Revert "${prizeTitle}" back to pending?`
                                        : `Revert "${prizeTitle}" back to pending? ${pts} points will be deducted from ${customerName}.`
                                : isCompleting
                                    ? `Mark "${prizeTitle}" by ${customerName} as completed?`
                                    : `Mark "${prizeTitle}" by ${customerName} as fulfilled?`
                        }
                    </s-text>
                    {isFulfilling && (
                        <s-text-field
                            label="Notes / License key / Download link (optional)"
                            placeholder="e.g. License key: XXXX-XXXX-XXXX"
                            value={trackingInput}
                            onChange={(e) => setTrackingInput(e.currentTarget.value)}
                        />
                    )}
                </s-stack>
                <s-button slot="secondary-actions" variant="secondary" commandFor="confirm-claim-modal" command="--hide" disabled={isSubmitting}>
                    Go Back
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    tone={isCancelling ? "critical" : undefined}
                    onClick={handleConfirm}
                    loading={isSubmitting}
                    disabled={isSubmitting || notEnoughPoints}
                >
                    {isCancelling
                        ? `Cancel & Refund ${pts} pts`
                        : isReverting
                            ? isCancelledRevert ? `Revert & Deduct ${pts} pts` : revertLabel
                            : isCompleting
                                ? "Mark as Completed"
                                : "Mark as Fulfilled"
                    }
                </s-button>
            </s-modal>

            {/* ── Admin note modal ── */}
            <s-modal
                ref={noteModalRef}
                id="note-claim-modal"
                heading="Admin Note"
                accessibilityLabel="Admin Note"
                onHide={() => setNoteTarget(null)}
            >
                <s-stack direction="block" gap="base">
                    <s-text tone="subdued" variant="bodySm">
                        Note for: <strong>{noteTarget?.prize?.title ?? "this claim"}</strong> — {noteTarget?.customer?.name || noteTarget?.customer?.email || ""}
                    </s-text>
                    <s-text-field
                        label="Note"
                        multiline={4}
                        placeholder="Internal notes about this claim..."
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.currentTarget.value)}
                    />
                </s-stack>
                <s-button slot="secondary-actions" variant="secondary" commandFor="note-claim-modal" command="--hide" disabled={isSubmitting}>
                    Cancel
                </s-button>
                <s-button slot="primary-action" variant="primary" onClick={handleSaveNote} loading={isSubmitting} disabled={isSubmitting}>
                    Save Note
                </s-button>
            </s-modal>

            {/* ── Bulk confirm modal ── */}
            <s-modal
                ref={bulkModalRef}
                id="bulk-claim-modal"
                heading={
                    bulkAction === "FULFILLED" ? "Bulk Mark Fulfilled" :
                        bulkAction === "COMPLETED" ? "Bulk Mark Completed" :
                            "Bulk Cancel & Refund"
                }
                accessibilityLabel="Bulk action"
                onHide={() => setBulkAction(null)}
            >
                <s-stack direction="block" gap="base">
                    {bulkAction === "CANCELLED" && (
                        <s-banner tone="warning" heading="Points will be refunded">
                            Points will be refunded to all selected customers automatically.
                        </s-banner>
                    )}
                    <s-text>
                        {bulkAction === "FULFILLED"
                            ? `Mark ${selectedIds.size} pending claim${selectedIds.size > 1 ? "s" : ""} as fulfilled?`
                            : bulkAction === "COMPLETED"
                                ? `Mark ${selectedIds.size} fulfilled claim${selectedIds.size > 1 ? "s" : ""} as completed?`
                                : `Cancel ${selectedIds.size} claim${selectedIds.size > 1 ? "s" : ""} and refund points?`
                        }
                    </s-text>
                    <s-text tone="subdued" variant="bodySm">
                        {bulkAction === "FULFILLED" ? "Only PENDING claims will be updated. Others will be skipped." :
                            bulkAction === "COMPLETED" ? "Only FULFILLED claims will be updated. Others will be skipped." :
                                "Only PENDING and FULFILLED claims will be cancelled. Others will be skipped."}
                    </s-text>
                </s-stack>
                <s-button slot="secondary-actions" variant="secondary" commandFor="bulk-claim-modal" command="--hide" disabled={isSubmitting}>
                    Go Back
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    tone={bulkAction === "CANCELLED" ? "critical" : undefined}
                    onClick={handleBulkConfirm}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                >
                    {bulkAction === "FULFILLED"
                        ? `Fulfill ${selectedIds.size} Claims`
                        : bulkAction === "COMPLETED"
                            ? `Complete ${selectedIds.size} Claims`
                            : `Cancel ${selectedIds.size} Claims`
                    }
                </s-button>
            </s-modal>

            {/* ── View Claim Modal ── */}
            <s-modal
                ref={viewModalRef}
                id="view-claim-modal"
                heading="Claim Details"
                accessibilityLabel="Claim Details"
                onHide={() => setViewTarget(null)}
            >
                {viewTarget && (() => {
                    const vc = viewTarget;
                    const sc = STATUS_CONFIG[vc.status] || STATUS_CONFIG.PENDING;
                    const customer = vc.customer;
                    const prize = vc.prize;
                    const fullName = customer?.name || [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || "Unknown";

                    return (
                        <s-stack direction="block" gap="base">

                            <s-stack direction="inline" gap="base" alignItems="center">
                                {prize?.imageUrl
                                    ? <s-thumbnail src={prize.imageUrl} size="large" alt={prize?.title ?? "Prize"} />
                                    : <s-thumbnail alt="No image" size="large" />
                                }
                                <s-stack direction="block" gap="small">
                                    <s-text variant="headingMd">{prize?.title ?? "—"}</s-text>
                                    {prize?.productValue && (
                                        <s-text tone="subdued" variant="bodySm">
                                            Product Value: ${Number(prize.productValue).toLocaleString()}
                                        </s-text>
                                    )}
                                </s-stack>
                            </s-stack>

                            <s-divider />

                            <s-stack direction="block" gap="small-200">
                                <s-text variant="headingSm">Customer</s-text>
                                <s-stack direction="inline" gap="small" alignItems="center">
                                    <s-text variant="bodyMd">{fullName}</s-text>
                                    {customer?.shopifyId && (
                                        <s-button variant="plain" onClick={() => handleOpenCustomer(customer.shopifyId)}>
                                            View profile
                                        </s-button>
                                    )}
                                </s-stack>
                                <s-text tone="subdued" variant="bodySm">{customer?.email ?? "—"}</s-text>
                                <s-text tone="subdued" variant="bodySm">
                                    Current Balance: {Number(customer?.points ?? 0).toLocaleString()} pts
                                </s-text>
                            </s-stack>

                            <s-divider />

                            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">Points Spent</s-text>
                                    <s-text variant="headingSm">{Number(vc.pointsCost).toLocaleString()} pts</s-text>
                                </s-stack>
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">Status</s-text>
                                    <s-badge tone={sc.tone}>{sc.icon} {sc.label}</s-badge>
                                </s-stack>
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">Claimed On</s-text>
                                    <s-text variant="bodySm">{formatDate(vc.createdAt)}</s-text>
                                </s-stack>
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">Fulfilled On</s-text>
                                    <s-text variant="bodySm">{formatDate(vc.fulfilledAt)}</s-text>
                                </s-stack>
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">Completed On</s-text>
                                    <s-text variant="bodySm">{formatDate(vc.completedAt)}</s-text>
                                </s-stack>
                                <s-stack direction="block" gap="small-200">
                                    <s-text tone="subdued" variant="bodySm">First Reviewed</s-text>
                                    <s-text variant="bodySm">
                                        {vc.viewedByAdmin ? formatDate(vc.viewedAt) : <s-badge tone="warning" size="small">👁 Not yet reviewed</s-badge>}
                                    </s-text>
                                </s-stack>
                            </s-grid>

                            {vc.trackingInfo && (
                                <>
                                    <s-divider />
                                    <s-stack direction="block" gap="small-200">
                                        <s-text variant="headingSm">🔑 Notes / License / Link</s-text>
                                        <s-text variant="bodySm">{vc.trackingInfo}</s-text>
                                    </s-stack>
                                </>
                            )}

                            {vc.adminNote && (
                                <>
                                    <s-divider />
                                    <s-stack direction="block" gap="small-200">
                                        <s-text variant="headingSm">📝 Admin Note</s-text>
                                        <s-text variant="bodySm" tone="subdued">{vc.adminNote}</s-text>
                                    </s-stack>
                                </>
                            )}

                        </s-stack>
                    );
                })()}

                <s-button slot="secondary-actions" variant="secondary" commandFor="view-claim-modal" command="--hide">
                    Close
                </s-button>

                {/* Secondary action buttons — revert, cancel, note */}
                {viewTarget && (() => {
                    const vt = viewTarget;
                    const vtBusy = isBusy(vt.id);
                    const vtPending = vt.status === "PENDING";
                    const vtFulfilled = vt.status === "FULFILLED";
                    const vtCompleted = vt.status === "COMPLETED";
                    const vtCancelled = vt.status === "CANCELLED";

                    return (
                        <>
                            {/* Note button always visible */}
                            <s-button
                                slot="secondary-actions"
                                variant="secondary"
                                disabled={vtBusy}
                                onClick={() => { viewModalRef.current?.hideOverlay(); openNoteModal(vt); }}
                            >
                                {vt.adminNote ? "Edit Note" : "Add Note"}
                            </s-button>

                            {/* Cancel — PENDING or FULFILLED */}
                            {(vtPending || vtFulfilled) && (
                                <s-button
                                    slot="secondary-actions"
                                    variant="secondary"
                                    tone="critical"
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "CANCELLED"); }}
                                >
                                    Cancel & Refund
                                </s-button>
                            )}

                            {/* Revert buttons */}
                            {vtFulfilled && (
                                <s-button
                                    slot="secondary-actions"
                                    variant="plain"
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "REVERT"); }}
                                >
                                    Revert to Pending
                                </s-button>
                            )}
                            {vtCompleted && (
                                <s-button
                                    slot="secondary-actions"
                                    variant="plain"
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "REVERT"); }}
                                >
                                    Revert to Fulfilled
                                </s-button>
                            )}
                            {vtCancelled && (
                                <s-button
                                    slot="secondary-actions"
                                    variant="plain"
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "REVERT"); }}
                                >
                                    Revert to Pending
                                </s-button>
                            )}

                            {/* Primary action */}
                            {vtPending && (
                                <s-button
                                    slot="primary-action"
                                    variant="primary"
                                    loading={vtBusy && pendingSubmit === "updateClaimStatus"}
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "FULFILLED"); }}
                                >
                                    Mark Fulfilled
                                </s-button>
                            )}
                            {vtFulfilled && (
                                <s-button
                                    slot="primary-action"
                                    variant="primary"
                                    loading={vtBusy && pendingSubmit === "updateClaimStatus"}
                                    disabled={vtBusy || isSubmitting}
                                    onClick={() => { viewModalRef.current?.hideOverlay(); openConfirm(vt, "COMPLETED"); }}
                                >
                                    Mark Completed
                                </s-button>
                            )}
                        </>
                    );
                })()}
            </s-modal>

            {/* ── Page content ── */}
            {renderLoaderError()}
            {renderNewBanner()}

            <s-section>
                <s-text tone="subdued" variant="bodySm">
                    Manage customer prize requests — fulfill when sent, complete when delivered, or cancel to refund points.
                </s-text>
            </s-section>

            <s-section>{renderStats()}</s-section>

            {renderFilterBar()}
            {renderBulkBar()}
            {renderTable()}

        </s-page>
    );
}