// =============================================================================
// app/widget-ui/ui/components/ActivityRow.jsx
// A single row inside the activity table (date / activity / points). This is
// a table row, not an Item — it doesn't share the Item shell because its
// shape (3 fixed columns) is fundamentally different from a card/row item.
// =============================================================================

import { h } from 'preact';
import { formatDate, formatPointsDisplay } from '../utils.js';

export function ActivityRow({ entry, isNew }) {
    return (
        <div class={`nbl-activity-row${isNew ? ' nbl-item-new' : ''}`}>
            <div class="nbl-activity-row__cell">{formatDate(entry.createdAt)}</div>
            <div class="nbl-activity-row__cell">{entry.activity || entry.reason || '—'}</div>
            <div
                class="nbl-activity-row__cell"
                dangerouslySetInnerHTML={{ __html: formatPointsDisplay(entry.points) }}
            />
        </div>
    );
}
