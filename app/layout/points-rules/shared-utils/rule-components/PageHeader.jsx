import { useNavigate } from "react-router";

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader
//
// The back link for every points-rule page. Emits only slotted elements, so it
// must be a direct child of <s-page>; the page title itself is the s-page's own
// `heading` (see ruleHeading below) and the Active/Inactive state lives in the
// summary panel's Active Status switch.
//
// Props:
//   busy {boolean} - disables the back button while submitting
// ─────────────────────────────────────────────────────────────────────────────

/** "Create — Order Rule" / "Edit — Order Rule" for <s-page heading>. */
export const ruleHeading = (mode, title) => `${mode === "edit" ? "Edit" : "Create"} — ${title}`;

export function PageHeader({ busy }) {
    const navigate = useNavigate();

    return (
        <s-button slot="breadcrumb-actions" onClick={() => navigate("/app/points-rules")} disabled={busy}>
            Points Rules
        </s-button>
    );
}
