/**
 * "Guide" button for a page header: opens the Feature Guide on the topic that
 * explains this page. Emits a slotted element, so it must be a direct child of
 * <s-page>.
 */
export function GuideButton({ topic }) {
    return (
        <s-button slot="secondary-actions" icon="info" href={`/app/guide?topic=${topic}`}>
            Guide
        </s-button>
    );
}
