// =============================================================================
// app/widget-ui/ui/tabs/PrizesTab.jsx
// Prizes tab — physical prize list + active prize claims (paginated).
// Purono tabs/prizes.js-er replacement.
// =============================================================================

import { h, Fragment } from 'preact';
import { Icon } from '../components/Icon.jsx';
import { Image } from '../components/Image.jsx';
import { Text } from '../components/Text.jsx';
import { formatNumber } from '../utils.js';
import { Item } from '../components/Item.jsx';
import { ItemList } from '../components/ItemList.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';

const PRIZE_STATUS_LABELS = {
    PENDING: 'Pending',
    FULFILLED: 'Fulfilled',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

function PrizeClaimRow({ claim, physicalPrizes, onOpenClaim, onViewImage, lbl }) {
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
            variant="row"
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

function PrizeItem({ prize, customerPoints, onClaim, onViewImage }) {
    const cost = Number(prize.pointsCost) || 0;
    const canClaim = cost > 0 && customerPoints >= cost;

    function handleClick() {
        if (!canClaim) return;
        onClaim(prize);
    }

    return (
        <Item
            active={canClaim}
            onClick={handleClick}
            leading={<Image src={prize.imageUrl} alt={prize.title} size="sm" onView={onViewImage} />}
            content={
                <div class="nbl-item__content">
                    <div class="nbl-item__title">{prize.title}</div>
                    <div class="nbl-item__meta">{formatNumber(cost)} pts</div>
                </div>
            }
            trailing={
                <div class="nbl-item__trailing">
                    {canClaim ? (
                        <Icon name="chevron-right" size="sm" />
                    ) : (
                        <Text as="span" bare extraClass="nbl-item__status">Not enough pts</Text>
                    )}
                </div>
            }
        />
    );
}

export function PrizesTab({ physicalPrizes, points, prizeClaims, perPage, paginationMode, lbl, onOpenInfo, onOpenClaim, onViewImage }) {
    const activePrizes = (physicalPrizes || []).filter((p) => p.isActive);
    const pagination = usePagination(prizeClaims || [], perPage || 5, paginationMode || 'pagination');

    function handleClaimClick(prize) {
        const customerPts = points;
        const cost = Number(prize.pointsCost) || 0;
        const rows = [];
        if (prize.productValue) {
            rows.push({ key: 'Prize value', val: `$${Number(prize.productValue).toLocaleString()}` });
        }
        rows.push({ key: 'Points cost', val: `${formatNumber(cost)} pts` });
        rows.push({ key: 'Your balance', val: `${formatNumber(customerPts)} pts` });
        rows.push({ key: 'Balance after', val: `${formatNumber(customerPts - cost)} pts` });

        onOpenInfo({
            heading: prize.title,
            rows,
            claim: true,
            data: { prize: { id: prize.id, pointsCost: cost }, title: prize.title, isPrize: true },
        });
    }

    return (
        <>
            <div class="nbl-item-list">
                <ItemList
                    items={activePrizes}
                    emptyText={lbl('emptyPrizes') || 'No prizes available'}
                    renderItem={(prize) => (
                        <PrizeItem prize={prize} customerPoints={points} onClaim={handleClaimClick} onViewImage={onViewImage} />
                    )}
                />
            </div>

            <div class="nbl-home-section-card nbl-home-section-card--standalone" data-home-section="prizes-tab-active-prizes">
                <div class="nbl-section-header">
                    <Icon name="reward-discount" px={16} />
                    <Text as="span" bare extraClass="nbl-section-title">{lbl('sectionPrizeRequests')}</Text>
                </div>
                <div class="nbl-item-rows">
                    <ItemList
                        items={pagination.pageItems}
                        emptyText={lbl('emptyMyPrizes')}
                        renderItem={(claim) => (
                            <PrizeClaimRow
                                claim={claim}
                                physicalPrizes={physicalPrizes}
                                onOpenClaim={onOpenClaim}
                                onViewImage={onViewImage}
                                lbl={lbl}
                            />
                        )}
                    />
                </div>
                <Pagination pagination={pagination} lbl={lbl} />
            </div>
        </>
    );
}