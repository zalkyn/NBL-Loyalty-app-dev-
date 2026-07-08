// =============================================================================
// modules/module-preact/MyPrizesTab.jsx
// My Prizes tab — purono tabs/prizes.js-er renderMyPrizesTab()-er replacement.
// =============================================================================

import { h } from 'preact';
import { formatNumber } from '../utils.js';
import { Item } from '../components/Item.jsx';
import { Image } from '../components/Image.jsx';
import { Text } from '../components/Text.jsx';
import { ItemList } from '../components/ItemList.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';

const PRIZE_STATUS_LABELS = {
    PENDING: 'Pending',
    FULFILLED: 'Fulfilled',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

function PrizeClaimCard({ claim, physicalPrizes, onOpenClaim, onViewImage, lbl }) {
    const prize = (physicalPrizes || []).find((p) => Number(p.id) === Number(claim.physicalPrizeId));
    const title = prize ? prize.title : `Prize request #${claim.id}`;
    const status = claim.status || 'PENDING';
    const statusKey = status.toLowerCase();

    const statusLabelKeys = {
        PENDING: 'prizeStatusPending',
        FULFILLED: 'prizeStatusFulfilled',
        COMPLETED: 'prizeStatusCompleted',
        CANCELLED: 'prizeStatusCancelled',
    };
    const statusLabel = (lbl && lbl(statusLabelKeys[status])) || PRIZE_STATUS_LABELS[status] || status;
    const statusModifierClass = (statusKey === 'fulfilled' || statusKey === 'completed') ? ' nbl-prize-status--fulfilled'
        : statusKey === 'cancelled' ? ' nbl-prize-status--cancelled' : '';

    return (
        <Item
            variant="card"
            selfSpaced
            active
            onClick={() => onOpenClaim(claim)}
            leading={<Image src={prize && prize.imageUrl} alt={title} size="sm" onView={onViewImage} />}
            content={
                <div class="nbl-item__content">
                    <Text as="span" bare extraClass="nbl-item__title">{title}</Text>
                    {claim.pointsCost ? <Text as="span" bare extraClass="nbl-item__meta">{formatNumber(claim.pointsCost)} pts</Text> : null}
                </div>
            }
            trailing={
                <Text as="span" bare extraClass={`nbl-item__status${statusModifierClass}`}>{statusLabel}</Text>
            }
        />
    );
}

export function MyPrizesTab({ prizeClaims, physicalPrizes, perPage, paginationMode, lbl, onOpenClaim, onViewImage }) {
    const pagination = usePagination(prizeClaims || [], perPage || 8, paginationMode || 'pagination');

    return (
        <div class="nbl-my-prizes-wrapper nbl-tab-content--flush">
            <div class="nbl-home-section-card__body--padded">
                <ItemList
                    items={pagination.pageItems}
                    emptyText={lbl('emptyMyPrizes')}
                    renderItem={(claim) => (
                        <PrizeClaimCard claim={claim} physicalPrizes={physicalPrizes} onOpenClaim={onOpenClaim} onViewImage={onViewImage} lbl={lbl} />
                    )}
                />
            </div>
            <Pagination pagination={pagination} lbl={lbl} />
        </div>
    );
}
