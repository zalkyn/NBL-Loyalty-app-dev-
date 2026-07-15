// =============================================================================
// app/widget-ui/ui/tabs/ActivitiesTab.jsx
// Full Activities tab — purono tabs/activities.js-er activities half-er
// replacement. Active Rewards tab ekhon alada ActiveRewardsTab.jsx file-e.
// =============================================================================

import { h, Fragment } from 'preact';
import { Pagination } from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { ActivityRow } from '../components/ActivityRow.jsx';

export function ActivitiesTab({ transactions, perPage, paginationMode, lbl }) {
    const pagination = usePagination(transactions || [], perPage || 10, paginationMode || 'pagination');

    return (
        <div class="nbl-tab-content nbl-tab-content--flush">
            <div class="nbl-activity-table nbl-home-section-card__body--padded">
                {pagination.pageItems.length ? (
                    <>
                        <div class="nbl-activity-table__head">
                            <div class="nbl-activity-table__head-cell">{lbl('activityColDate')}</div>
                            <div class="nbl-activity-table__head-cell">{lbl('activityColActivity')}</div>
                            <div class="nbl-activity-table__head-cell">{lbl('activityColPoints')}</div>
                        </div>
                        <div>
                            {pagination.pageItems.map((entry, i) => <ActivityRow key={i} entry={entry} />)}
                        </div>
                    </>
                ) : (
                    <div class="nbl-activity-table__empty">{lbl('emptyActivity')}</div>
                )}
            </div>
            <Pagination pagination={pagination} lbl={lbl} />
        </div>
    );
}
