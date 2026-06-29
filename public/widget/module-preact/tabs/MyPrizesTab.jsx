// =============================================================================
// modules/module-preact/MyPrizesTab.jsx
// My Prizes tab — purono tabs/prizes.js-er renderMyPrizesTab()-er replacement.
// =============================================================================

import { h } from 'preact';
import { ItemList } from '../components/ItemList.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { PrizeClaimItem } from '../components/items.jsx';

export function MyPrizesTab({ prizeClaims, physicalPrizes, perPage, paginationMode, lbl, onOpenClaim, onViewImage }) {
    const pagination = usePagination(prizeClaims || [], perPage || 8, paginationMode || 'pagination');

    return (
        <div class="nbl-my-prizes-wrapper">
            <ItemList
                items={pagination.pageItems}
                emptyText={lbl('emptyMyPrizes')}
                renderItem={(claim) => (
                    <PrizeClaimItem claim={claim} physicalPrizes={physicalPrizes} onOpenClaim={onOpenClaim} onViewImage={onViewImage} lbl={lbl} />
                )}
            />
            <Pagination pagination={pagination} lbl={lbl} />
        </div>
    );
}
