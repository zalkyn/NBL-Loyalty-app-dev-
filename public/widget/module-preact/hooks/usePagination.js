// =============================================================================
// modules/module-preact/usePagination.js
// Purono pagination.js engine-er replacement. Duইটা mode support kore:
// 'pagination' (prev/next + dots) ar 'loadmore' (button, progressively load).
// =============================================================================

import { useState, useMemo } from 'preact/hooks';

export function usePagination(items, perPage = 5, mode = 'pagination') {
    const [page, setPage] = useState(1);
    const [loaded, setLoaded] = useState(perPage);

    const totalPages = Math.max(1, Math.ceil(items.length / perPage));

    if (mode === 'loadmore') {
        const visibleCount = Math.min(loaded, items.length);
        const pageItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
        const hasMore = loaded < items.length;

        function loadMore() {
            setLoaded((l) => Math.min(l + perPage, items.length));
        }

        return {
            mode: 'loadmore',
            pageItems,
            hasMore,
            loadMore,
            loaded: visibleCount,
            total: items.length,
        };
    }

    const safePage = Math.min(page, totalPages);
    const pageItems = useMemo(() => {
        const start = (safePage - 1) * perPage;
        return items.slice(start, start + perPage);
    }, [items, safePage, perPage]);

    function nextPage() { setPage((p) => Math.min(p + 1, totalPages)); }
    function prevPage() { setPage((p) => Math.max(p - 1, 1)); }
    function goToPage(p) { setPage(Math.min(Math.max(1, p), totalPages)); }

    return {
        mode: 'pagination',
        pageItems,
        page: safePage,
        totalPages,
        nextPage,
        prevPage,
        goToPage,
        total: items.length,
        perPage,
    };
}
