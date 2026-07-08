// =============================================================================
// modules/module-preact/ActiveRewardsTab.jsx
// Full Active Rewards tab — purono tabs/activities.js-er active-rewards
// half-er replacement. (Ager version-e eta bhul kore ActivitiesTab.jsx-er
// bhitore likha chilo — eта alada tab, tai alada file-e thaka uchit.)
// =============================================================================

import { h } from 'preact';
import { Item } from '../components/Item.jsx';
import { Icon } from '../components/Icon.jsx';
import { ItemList } from '../components/ItemList.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';

function ActiveRewardCard({ reward, onOpenVoucher }) {
    return (
        <Item
            variant="card"
            selfSpaced
            active
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

export function ActiveRewardsTab({ customerRewards, perPage, paginationMode, lbl, onOpenVoucher }) {
    const active = (customerRewards || []).filter((r) => r.discountUsed === false && r.status === 'ACTIVE');
    const pagination = usePagination(active, perPage || 8, paginationMode || 'pagination');

    return (
        <div class="nbl-tab-content nbl-tab-content--flush">
            <div class="nbl-home-section-card__body--padded">
                <ItemList
                    items={pagination.pageItems}
                    emptyText={lbl('emptyRewards')}
                    renderItem={(reward) => <ActiveRewardCard reward={reward} onOpenVoucher={onOpenVoucher} />}
                />
            </div>
            <Pagination pagination={pagination} lbl={lbl} />
        </div>
    );
}
