import { authenticate } from "../shopify.server";
import {
    useActionData,
    useLoaderData,
    useSubmit,
    useNavigation,
    useNavigate,
} from "react-router";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import oldCustomerStoreFromShop from "../controller/customers/syncCustomersFromStore";
import { syncCustomersConfig } from "@controller/metafieldsSync/syncCustomerConfig";
import { useEffect, useState, useCallback, useRef } from "react";
import Pagination from "@components/pagination/Pagination";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_PAGE_SIZES = [5, 10, 25, 50];
const DEFAULT_PAGE_SIZE = 50;

const SORT_OPTIONS = [
    { value: "enrolledAt-desc", label: "Latest enrolled" },
    { value: "enrolledAt-asc", label: "Oldest enrolled" },
    { value: "id-asc", label: "ID (ascending)" },
    { value: "id-desc", label: "ID (descending)" },
    { value: "name-asc", label: "Name (A–Z)" },
    { value: "name-desc", label: "Name (Z–A)" },
    { value: "email-asc", label: "Email (A–Z)" },
    { value: "email-desc", label: "Email (Z–A)" },
    { value: "points-desc", label: "Points (high to low)" },
    { value: "points-asc", label: "Points (low to high)" },
];

const SORTABLE_FIELDS = new Set(["id", "name", "email", "points", "enrolledAt"]);

function parseSortBy(raw) {
    const fallback = "enrolledAt-desc";
    if (!raw || typeof raw !== "string") return fallback;
    return SORT_OPTIONS.map((o) => o.value).includes(raw) ? raw : fallback;
}

function parsePageSize(raw) {
    const n = parseInt(raw, 10);
    return ALLOWED_PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);

    const pageSize = parsePageSize(url.searchParams.get("pageSize"));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const search = url.searchParams.get("search")?.trim().slice(0, 100) || "";
    const sortBy = parseSortBy(url.searchParams.get("sortBy"));

    const [field, direction] = sortBy.split("-");
    const orderDir = direction === "asc" ? "asc" : "desc";

    const where = {
        sessionId: session.id,
        ...(search && {
            OR: [
                { name: { startsWith: search, mode: "insensitive" } },
                { email: { startsWith: search, mode: "insensitive" } },
            ],
        }),
    };

    try {
        const [customers, totalCount] = await prisma.$transaction([
            prisma.customer.findMany({
                where,
                orderBy: SORTABLE_FIELDS.has(field)
                    ? { [field]: orderDir }
                    : { enrolledAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    points: true,
                    enrolledAt: true,
                    activeStatus: true,
                    _count: {
                        select: {
                            rewards: true,
                            transactions: true,
                        },
                    },
                },
            }),
            prisma.customer.count({ where }),
        ]);

        return { customers, totalCount, page, pageSize, search, sortBy, error: null };
    } catch (err) {
        console.error("[customers.loader] DB error:", err);
        return {
            customers: [],
            totalCount: 0,
            page: 1,
            pageSize,
            search,
            sortBy,
            error: "Failed to load customers. Please try again.",
        };
    }
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "sync-customers") {
        try {
            const result = await oldCustomerStoreFromShop(admin, session);
            await syncCustomersConfig(admin, session);
            return Response.json({
                message: `Synced ${result.success} customers${result.failed ? `, ${result.failed} failed` : ""
                    }`,
                isError: false,
            });
        } catch (err) {
            console.error("[customers.action] Sync error:", err);
            return Response.json({
                message: "Failed to sync customers. Please try again.",
                isError: true,
            });
        }
    }

    return Response.json({ message: "Unknown action.", isError: true });
};

// ─── ServerPagination wrapper ─────────────────────────────────────────────────

function ServerPagination({
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    onPageChange,
    onPageSizeChange,
    label,
}) {
    return (
        <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            perPage={pageSize}
            startIndex={(currentPage - 1) * pageSize}
            setCurrentPage={onPageChange}
            setPerPage={onPageSizeChange}
            label={label}
            perPageOptions={ALLOWED_PAGE_SIZES}
        />
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Customers() {
    const {
        customers,
        totalCount,
        page,
        pageSize,
        search,
        sortBy,
        error: loaderError,
    } = useLoaderData();

    const actionData = useActionData();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const nav = useNavigation();
    const navigate = useNavigate();

    const isSyncing = nav.state === "submitting" && nav.formMethod === "POST";

    // Track which customer row is navigating
    const [navigatingTo, setNavigatingTo] = useState(null);

    // Only show full-page spinner for filter/sort/pagination (same route GET),
    // NOT for details navigation (different route)
    const isLoading = nav.state === "loading"
        && nav.formMethod !== "POST"
        && navigatingTo === null
        && nav.location?.pathname === window.location.pathname;

    // Clear navigatingTo when navigation completes
    useEffect(() => {
        if (nav.state === "idle") setNavigatingTo(null);
    }, [nav.state]);

    const [localSearch, setLocalSearch] = useState(search);
    const debounceRef = useRef(null);

    useEffect(() => { setLocalSearch(search); }, [search]);

    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, {
                duration: 5000,
                isError: actionData.isError ?? false,
            });
        }
    }, [actionData]);

    // ── URL updater ──────────────────────────────────────────────────────────
    const updateURL = useCallback(
        (params) => {
            const next = new URLSearchParams({
                search: params.search ?? search,
                sortBy: params.sortBy ?? sortBy,
                page: String(params.page ?? 1),
                pageSize: String(params.pageSize ?? pageSize),
            });
            submit(next, { method: "GET", replace: true });
        },
        [submit, search, sortBy, pageSize],
    );

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSearch = (e) => {
        const val = e.target.value;
        setLocalSearch(val);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateURL({ search: val, page: 1 });
        }, 400);
    };

    const handleSortChange = (e) => updateURL({ sortBy: e.target.value, page: 1 });
    const handlePageChange = (newPage) => updateURL({ page: newPage });
    const handlePageSizeChange = (newSize) => updateURL({ pageSize: newSize, page: 1 });
    const handleSync = () => submit({ submitType: "sync-customers" }, { method: "POST" });

    const handleDetails = (customerId) => {
        setNavigatingTo(customerId);
        navigate(`/app/customers/${customerId}`);
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <s-page title="Customers" inlineSize="base">
            <s-button
                onClick={handleSync}
                slot="primary-action"
                variant="primary"
                loading={isSyncing}
                disabled={isSyncing}
            >
                {isSyncing ? "Syncing…" : "Sync Customers"}
            </s-button>

            <s-section>
                {/* ── Toolbar ── */}
                <s-grid gridTemplateColumns="1fr 1fr 1fr" alignItems="center" gap="base">
                    <h2 style={{ margin: 0 }}>
                        Customers ({totalCount.toLocaleString()})
                    </h2>
                    <s-search-field
                        label="Search customers"
                        labelAccessibilityVisibility="exclusive"
                        name="customerSearch"
                        placeholder="Search by name or email"
                        value={localSearch}
                        onInput={handleSearch}
                        disabled={isLoading}
                    />
                    <s-select
                        label="Sort by"
                        labelAccessibilityVisibility="exclusive"
                        name="sortBy"
                        value={sortBy}
                        onChange={handleSortChange}
                        disabled={isLoading}
                    >
                        {SORT_OPTIONS.map((o) => (
                            <s-option key={o.value} value={o.value}>{o.label}</s-option>
                        ))}
                    </s-select>
                </s-grid>

                <s-box paddingBlock="base"><s-divider /></s-box>

                {/* ── Error banner ── */}
                {loaderError && (
                    <s-banner tone="critical" style={{ marginBottom: "16px" }}>
                        {loaderError}
                    </s-banner>
                )}

                {/* ── Table ── */}
                {isLoading ? (
                    <s-box
                        padding="base"
                        style={{
                            textAlign: "center",
                            minHeight: "200px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <s-spinner />
                    </s-box>
                ) : (
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Customer</s-table-header>
                            <s-table-header>Events</s-table-header>
                            <s-table-header>Points</s-table-header>
                            <s-table-header>Rewards</s-table-header>
                            <s-table-header>Enrolled At</s-table-header>
                            <s-table-header />
                        </s-table-header-row>
                        <s-table-body>
                            {customers.length === 0 ? (
                                <s-table-row>
                                    <s-table-cell
                                        colSpan={6}
                                        style={{
                                            textAlign: "center",
                                            color: "var(--p-color-text-secondary, #6d7175)",
                                            padding: "32px 0",
                                        }}
                                    >
                                        {search
                                            ? `No customers found for "${search}".`
                                            : "No customers yet. Click Sync Customers to get started."}
                                    </s-table-cell>
                                </s-table-row>
                            ) : customers.map((c) => {
                                const isThisNavigating = navigatingTo === c.id;
                                const isOtherNavigating = navigatingTo !== null && navigatingTo !== c.id;

                                return (
                                    <s-table-row key={c.id}>
                                        <s-table-cell>
                                            <s-heading>{c.name || "N/A"}</s-heading>
                                            <s-box />
                                            <s-text>{c.email || "N/A"}</s-text>
                                        </s-table-cell>
                                        <s-table-cell>{c._count.transactions}</s-table-cell>
                                        <s-table-cell>{c.points.toLocaleString()}</s-table-cell>
                                        <s-table-cell>{c._count.rewards}</s-table-cell>
                                        <s-table-cell>
                                            {c.enrolledAt
                                                ? new Date(c.enrolledAt).toLocaleDateString()
                                                : "N/A"}
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-button
                                                variant="text"
                                                loading={isThisNavigating}
                                                disabled={isThisNavigating || isOtherNavigating}
                                                onClick={() => handleDetails(c.id)}
                                            >
                                                {isThisNavigating ? "Loading…" : "Details"}
                                            </s-button>
                                        </s-table-cell>
                                    </s-table-row>
                                );
                            })}
                        </s-table-body>
                    </s-table>
                )}

                {/* ── Pagination ── */}
                {!loaderError && totalCount > 0 && (
                    <ServerPagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalCount={totalCount}
                        pageSize={pageSize}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        label="customers"
                    />
                )}
            </s-section>
        </s-page>
    );
}