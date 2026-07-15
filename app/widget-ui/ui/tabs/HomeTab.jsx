// =============================================================================
// app/widget-ui/ui/tabs/HomeTab.jsx
// Home tab — nav cards + active rewards/prize-requests/activities preview.
// Purono tabs/home.js-er replacement. Pratiটা section-er nijer pagination
// instance ache (home-rewards, home-prize-requests, home-activities) —
// purono pagination.js-er moto.
// =============================================================================

import { h, Fragment } from 'preact';
import { formatNumber } from '../utils.js';
import { Icon } from '../components/Icon.jsx';
import { Image } from '../components/Image.jsx';
import { Text } from '../components/Text.jsx';
import { Item } from '../components/Item.jsx';
import { ItemList } from '../components/ItemList.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { ActivityRow } from '../components/ActivityRow.jsx';

const PRIZE_STATUS_LABELS = {
    PENDING: 'Pending',
    FULFILLED: 'Fulfilled',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

function HomeNavCard({ navKey, iconName, label, onNavigate }) {
    return (
        <div data-nav={navKey} class="nbl-home-nav__item" onClick={() => onNavigate(navKey)}>
            <div class="nbl-home-nav__icon">
                <Icon size='md' name={iconName} />
            </div>
            <Text as="span" bare extraClass="nbl-home-nav__label" size="md">{label}</Text>
            <div class="nbl-home-nav__chevron">
                <Icon name="chevron-right" size="sm" />
            </div>
        </div>
    );
}

function SectionHeader({ iconName, title }) {
    return (
        <div class="nbl-section-header">
            <Icon name={iconName} px={16} />
            <Text as="span" bare extraClass="nbl-section-title">{title}</Text>
        </div>
    );
}

function ActiveRewardRow({ reward, onOpenVoucher }) {
    return (
        <Item
            variant="row"
            onClick={() => onOpenVoucher(reward.code)}
            leading={<Icon name="reward-discount" px={26} />}
            content={
                <div class="nbl-item__content">
                    <div class="nbl-item__title">{reward.title || 'Voucher'}</div>
                </div>
            }
            trailing={
                <div class="nbl-item__trailing">
                    <Icon name="chevron-right" size="sm" />
                </div>
            }
        />
    );
}

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

export function HomeTab({
    showRewardsSection,
    showPrizeRequestsSection,
    showActivitiesSection,
    customerRewards,
    prizeClaims,
    physicalPrizes,
    transactions,
    homeRewardsPerPage,
    homePrizeRequestsPerPage,
    homeActivitiesPerPage,
    paginationMode,
    onNavigate,
    onOpenVoucher,
    onOpenClaim,
    onViewImage,
    lbl,
}) {
    const activeRewards = (customerRewards || []).filter((r) => r.discountUsed === false && r.status === 'ACTIVE');

    const rewardsPagination = usePagination(activeRewards, homeRewardsPerPage || 5, paginationMode || 'pagination');
    const prizeRequestsPagination = usePagination(prizeClaims || [], homePrizeRequestsPerPage || 5, paginationMode || 'pagination');
    const activitiesPagination = usePagination(transactions || [], homeActivitiesPerPage || 5, paginationMode || 'pagination');

    return (
        <div class="nbl-home-tab">
            <div class="nbl-home-nav">
                <HomeNavCard navKey="rewards" iconName="rewards" label={lbl('homeCardBrowse') || 'Browse rewards'} onNavigate={onNavigate} />
                <HomeNavCard navKey="points" iconName="lightning" label={lbl('homeCardEarn') || 'Earn points'} onNavigate={onNavigate} />
                <HomeNavCard navKey="referral" iconName="referral" label={lbl('homeCardRefer') || 'Refer a friend'} onNavigate={onNavigate} />
            </div>

            <div class="nbl-home-sections">
                {showRewardsSection && (
                    <div class="nbl-home-section-card" data-home-section="rewards">
                        <SectionHeader iconName="reward-discount" title={lbl('sectionActiveRewards') || 'Active Rewards'} />
                        <div class="nbl-item-list--divided">
                            <ItemList
                                items={rewardsPagination.pageItems}
                                emptyText={lbl('emptyRewards')}
                                renderItem={(reward) => <ActiveRewardRow reward={reward} onOpenVoucher={onOpenVoucher} />}
                            />
                        </div>
                        <Pagination pagination={rewardsPagination} lbl={lbl} />
                    </div>
                )}

                {showPrizeRequestsSection && (
                    <div class="nbl-home-section-card" data-home-section="prize-requests">
                        <SectionHeader iconName="reward-discount" title={lbl('sectionPrizeRequests') || 'Prize Requests'} />
                        <div class="nbl-item-rows">
                            <ItemList
                                items={prizeRequestsPagination.pageItems}
                                emptyText={lbl('emptyMyPrizes')}
                                renderItem={(claim) => (
                                    <PrizeClaimRow claim={claim} physicalPrizes={physicalPrizes} onOpenClaim={onOpenClaim} onViewImage={onViewImage} lbl={lbl} />
                                )}
                            />
                        </div>
                        <Pagination pagination={prizeRequestsPagination} lbl={lbl} />
                    </div>
                )}

                {showActivitiesSection && (
                    <div class="nbl-home-section-card" data-home-section="activities">
                        <SectionHeader iconName="lightning" title={lbl('sectionRecentActivity') || 'Recent Activity'} />
                        <div class="nbl-activity-table">
                            {activitiesPagination.pageItems.length ? (
                                <>
                                    <div class="nbl-activity-table__head">
                                        <div class="nbl-activity-table__head-cell">{lbl('activityColDate')}</div>
                                        <div class="nbl-activity-table__head-cell">{lbl('activityColActivity')}</div>
                                        <div class="nbl-activity-table__head-cell">{lbl('activityColPoints')}</div>
                                    </div>
                                    <div>
                                        {activitiesPagination.pageItems.map((entry, i) => <ActivityRow key={i} entry={entry} />)}
                                    </div>
                                </>
                            ) : (
                                <div class="nbl-activity-table__empty">{lbl('emptyActivity')}</div>
                            )}
                        </div>
                        <Pagination pagination={activitiesPagination} lbl={lbl} />
                    </div>
                )}
            </div>
        </div>
    );
}
