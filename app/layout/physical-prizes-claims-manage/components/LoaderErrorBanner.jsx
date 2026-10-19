/**
 * Shown when the loader's try/catch caught an error and returned a safe
 * empty state instead of crashing the page. Page-wide, so it sits directly
 * under <s-page> in the supplemental-start slot rather than inside a section.
 */
export function LoaderErrorBanner({ loaderError }) {
    if (!loaderError) return null;
    return (
        <s-banner slot="supplemental-start" tone="critical" heading="Something went wrong">
            {loaderError}
        </s-banner>
    );
}
