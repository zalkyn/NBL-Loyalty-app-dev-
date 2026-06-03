/**
 * @file app.events.standalone.jsx
 * @description Standalone Points Events management page.
 *
 * All features self-contained — no atoms, no child component imports:
 *   - Loader  : fetches all events for the shop
 *   - Action  : create / update / delete an Event
 *   - Table   : events list with edit / delete actions
 *   - Modals  : edit modal + delete confirmation modal
 *
 * Pattern mirrors app_points-rule-new.jsx:
 *   - `useNavigation` drives loading / disabled states
 *   - `useAppBridge` for toast
 *   - Client-side duplicate name/type guard before submit
 */

import { useEffect, useState, useCallback } from "react";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";

// ─────────────────────────────────────────────────────────────────────────────
// EVENT TYPE OPTIONS
// Mirrors the seed events in afterAuthSetup.js + allows custom additions.
// Each entry has a value (stored in DB) and a human-readable label.
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
    { value: "ORDER", label: "ORDER — Direct Purchase" },
    { value: "REFERRAL", label: "REFERRAL — Refer a Friend" },
    { value: "REVIEW", label: "REVIEW — Product Review (Loox)" },
    // { value: "BIRTHDAY", label: "BIRTHDAY — Birthday Reward" },
    // { value: "SIGNUP", label: "SIGNUP — Account Sign Up" },
    // { value: "SUBSCRIPTION", label: "SUBSCRIPTION — Subscription Event" },
    // { value: "MANUAL", label: "MANUAL — Manual Adjustment" },
    // { value: "CUSTOM", label: "CUSTOM — Custom Event" },
];

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const events = await prisma.event.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
    });

    return { events };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (submitType === "addEvent") {
        const newEvent = JSON.parse(formData.get("event") || "{}");

        if (!newEvent.name?.trim() || !newEvent.type?.trim())
            return { message: "Name and Type are required.", status: "error", submitType };

        try {
            const created = await prisma.event.create({
                data: {
                    shop: session.shop,
                    sessionId: session.id,
                    name: newEvent.name.trim(),
                    type: newEvent.type.toUpperCase().trim(),
                    description: newEvent.description?.trim() || null,
                },
            });

            return { message: "Event created successfully.", event: created, status: "success", submitType };
        } catch (err) {
            console.error("Create Event Error:", err);
            const msg = err.code === "P2002"
                ? "An event with this name or type already exists."
                : "Failed to create event. Please try again.";
            return { message: msg, status: "error", submitType };
        }
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (submitType === "updateEvent") {
        const updatedEvent = JSON.parse(formData.get("event") || "{}");

        if (!updatedEvent.id || !updatedEvent.name?.trim() || !updatedEvent.type?.trim())
            return { message: "ID, Name, and Type are required.", status: "error", submitType };

        try {
            const event = await prisma.event.update({
                where: { id: parseInt(updatedEvent.id), sessionId: session.id },
                data: {
                    name: updatedEvent.name.trim(),
                    type: updatedEvent.type.toUpperCase().trim(),
                    description: updatedEvent.description?.trim() || null,
                    isActive: updatedEvent.isActive ?? true,
                },
            });

            return { message: "Event updated successfully.", event, status: "success", submitType };
        } catch (err) {
            console.error("Update Event Error:", err);
            const msg = err.code === "P2002"
                ? "An event with this name or type already exists."
                : "Failed to update event. Please try again.";
            return { message: msg, status: "error", submitType };
        }
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (submitType === "deleteEvent") {
        const eventId = parseInt(formData.get("eventId"));
        if (!eventId)
            return { message: "Event ID is required.", status: "error", submitType };

        try {
            await prisma.event.delete({
                where: { id: eventId, sessionId: session.id },
            });
            return { message: "Event deleted successfully.", status: "success", submitType };
        } catch (err) {
            console.error("Delete Event Error:", err);
            return { message: "Failed to delete event. Please try again.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT STATE
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_EVENT = { name: "", type: "", description: "", isActive: true };

const PER_PAGE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function EventsPage() {
    const submit = useSubmit();
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    // ── Submission state via useNavigation ────────────────────────────────────
    const pendingSubmitType = navigation.formData?.get("submitType") ?? null;
    const isSubmitting = navigation.state === "submitting";

    const isAdding = isSubmitting && pendingSubmitType === "addEvent";
    const isUpdating = isSubmitting && pendingSubmitType === "updateEvent";
    const isDeleting = isSubmitting && pendingSubmitType === "deleteEvent";
    const isAnyBusy = isSubmitting;

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEvent, setNewEvent] = useState({ ...EMPTY_EVENT });
    const [selectedEvent, setSelectedEvent] = useState(null); // for edit/delete modals

    // ── Pagination ────────────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);

    const events = loaderData?.events ?? [];
    const totalPages = Math.max(1, Math.ceil(events.length / PER_PAGE));
    const paginatedEvents = events.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION DATA EFFECT
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });

        if (actionData.status === "success") {
            if (actionData.submitType === "addEvent") {
                setShowAddForm(false);
                setNewEvent({ ...EMPTY_EVENT });
            }
            if (actionData.submitType === "updateEvent" || actionData.submitType === "deleteEvent") {
                setSelectedEvent(null);
            }
        }
    }, [actionData]);

    useEffect(() => { setCurrentPage(1); }, [events.length]);

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Client-side validation before submit.
     * `excludeId` skips the currently-edited record so update doesn't block itself.
     *
     * Note: type value comes from the select dropdown (always uppercase).
     * Name duplicate check still applies — two events can't share the same name.
     */
    const validateEvent = useCallback((ev, excludeId = null) => {
        if (!ev.name?.trim()) {
            shopify.toast.show("Event name is required.", { isError: true });
            return false;
        }
        if (!ev.type) {
            shopify.toast.show("Please select an event type.", { isError: true });
            return false;
        }

        const norm = (s) => s?.trim().toLowerCase();
        const others = excludeId ? events.filter((e) => e.id !== excludeId) : events;

        if (others.some((e) => norm(e.name) === norm(ev.name))) {
            shopify.toast.show("An event with this name already exists.", { isError: true });
            return false;
        }
        // Type uniqueness — only relevant for create (edit type is locked)
        if (!excludeId && others.some((e) => norm(e.type) === norm(ev.type))) {
            shopify.toast.show("An event with this type already exists.", { isError: true });
            return false;
        }

        return true;
    }, [events, shopify]);

    // ─────────────────────────────────────────────────────────────────────────
    // SUBMIT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    const handleAddEvent = useCallback(() => {
        if (!validateEvent(newEvent)) return;
        submit({ submitType: "addEvent", event: JSON.stringify(newEvent) }, { method: "post" });
    }, [newEvent, submit, validateEvent]);

    const handleUpdateEvent = useCallback(() => {
        if (!validateEvent(selectedEvent, selectedEvent?.id)) return;
        submit({ submitType: "updateEvent", event: JSON.stringify(selectedEvent) }, { method: "post" });
    }, [selectedEvent, submit, validateEvent]);

    const handleDeleteEvent = useCallback(() => {
        if (!selectedEvent) return;
        submit({ submitType: "deleteEvent", eventId: selectedEvent.id }, { method: "post" });
    }, [selectedEvent, submit]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — header bar
    // ─────────────────────────────────────────────────────────────────────────

    const renderHeading = () => (
        <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
            <h2 style={{ marginBlock: "0" }}>Points Events</h2>
            <s-button
                icon={showAddForm ? "minus" : "plus"}
                variant={showAddForm ? "auto" : "primary"}
                disabled={isAnyBusy}
                onClick={() => {
                    setNewEvent({ ...EMPTY_EVENT });
                    setShowAddForm((prev) => !prev);
                }}
            >
                {showAddForm ? "Cancel" : "Add New Event"}
            </s-button>
        </s-grid>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — add event form
    // ─────────────────────────────────────────────────────────────────────────

    const renderAddForm = () => {
        // Collect already-used type values so we can disable them in the dropdown
        const usedTypes = new Set(events.map((ev) => ev.type.toUpperCase()));

        return (
            <s-section>
                <h3 style={{ marginBlock: "0" }}>Add New Event</h3>
                <s-box paddingBlock="base">
                    <s-divider />
                </s-box>

                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                    <s-text-field
                        label="Event Name *"
                        value={newEvent.name}
                        disabled={isAdding}
                        placeholder="e.g. Order Reward"
                        onInput={(e) => setNewEvent((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <s-select
                        label="Event Type *"
                        value={newEvent.type}
                        disabled={isAdding}
                        onChange={(e) => setNewEvent((prev) => ({ ...prev, type: e.target.value }))}
                    >
                        <s-option value="">Select event type…</s-option>
                        {EVENT_TYPES.map(({ value, label }) => {
                            const alreadyUsed = usedTypes.has(value);
                            return (
                                <s-option key={value} value={value} disabled={alreadyUsed}>
                                    {label}{alreadyUsed ? " — Already created" : ""}
                                </s-option>
                            );
                        })}
                    </s-select>
                </s-grid>

                <s-box paddingBlockEnd="base" />

                <s-text-area
                    label="Description"
                    value={newEvent.description}
                    disabled={isAdding}
                    placeholder="Optional description for this event"
                    onInput={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
                />

                <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                    <s-button
                        disabled={isAdding}
                        onClick={() => { setShowAddForm(false); setNewEvent({ ...EMPTY_EVENT }); }}
                    >
                        Cancel
                    </s-button>
                    <s-button
                        variant="primary"
                        loading={isAdding}
                        disabled={isAdding || !newEvent.name?.trim() || !newEvent.type}
                        onClick={handleAddEvent}
                    >
                        Save Event
                    </s-button>
                </s-stack>
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — events table
    // ─────────────────────────────────────────────────────────────────────────

    const renderTable = () => (
        <s-section>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Name</s-table-header>
                    <s-table-header>Type</s-table-header>
                    <s-table-header>Description</s-table-header>
                    <s-table-header>Active</s-table-header>
                    <s-table-header>Created</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {paginatedEvents.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                No events yet. Click "Add New Event" to create one.
                            </s-table-cell>
                        </s-table-row>
                    ) : (
                        paginatedEvents.map((ev) => (
                            <s-table-row key={ev.id}>
                                <s-table-cell>{ev.name}</s-table-cell>
                                <s-table-cell>{ev.type}</s-table-cell>
                                <s-table-cell>{ev.description || "—"}</s-table-cell>
                                <s-table-cell>{ev.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>
                                <s-table-cell>
                                    {new Date(ev.createdAt).toLocaleDateString()}
                                </s-table-cell>
                                <s-table-cell>
                                    <s-stack gap="small" direction="inline">
                                        <s-button
                                            variant="text" size="small" icon="edit"
                                            disabled={isAnyBusy}
                                            onClick={() => setSelectedEvent({ ...ev })}
                                            commandFor="edit-event-modal"
                                            command="--show"
                                        />
                                        <s-button
                                            variant="text" size="small" icon="delete" destructive
                                            disabled={isAnyBusy}
                                            onClick={() => setSelectedEvent(ev)}
                                            commandFor="delete-event-modal"
                                            command="--show"
                                        />
                                    </s-stack>
                                </s-table-cell>
                            </s-table-row>
                        ))
                    )}
                </s-table-body>
            </s-table>

            {totalPages > 1 && (
                <s-stack direction="inline" justifyContent="center" gap="small" style={{ marginBlockStart: "1rem" }}>
                    <s-button
                        variant="plain"
                        disabled={currentPage === 1 || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                        ← Prev
                    </s-button>
                    <s-text>Page {currentPage} of {totalPages}</s-text>
                    <s-button
                        variant="plain"
                        disabled={currentPage === totalPages || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                        Next →
                    </s-button>
                </s-stack>
            )}
        </s-section>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — edit modal
    // ─────────────────────────────────────────────────────────────────────────

    const renderEditModal = () => (
        <s-modal id="edit-event-modal" heading="Edit Points Event" size="base">
            {selectedEvent && (
                <>
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-text-field
                            label="Name *"
                            value={selectedEvent.name ?? ""}
                            disabled={isUpdating}
                            onInput={(e) => setSelectedEvent((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        {/*
                         * Type is read-only in edit mode — changing it would invalidate
                         * existing points rules and webhook handlers (ORDER, REFERRAL, REVIEW…).
                         * Shown as a disabled select so the value is clear but cannot be changed.
                         */}
                        <s-select
                            label="Event Type"
                            value={selectedEvent.type ?? ""}
                            disabled
                            details="Event type cannot be changed after creation."
                        >
                            {EVENT_TYPES.map(({ value, label }) => (
                                <s-option key={value} value={value}>{label}</s-option>
                            ))}
                            {/* Fallback for any type not in the predefined list */}
                            {!EVENT_TYPES.some((t) => t.value === selectedEvent.type) && (
                                <s-option value={selectedEvent.type}>{selectedEvent.type}</s-option>
                            )}
                        </s-select>
                    </s-grid>

                    <s-box paddingBlockEnd="base" />

                    <s-text-area
                        label="Description"
                        value={selectedEvent.description ?? ""}
                        disabled={isUpdating}
                        onInput={(e) => setSelectedEvent((prev) => ({ ...prev, description: e.target.value }))}
                    />

                    <s-box paddingBlockEnd="base" />

                    <s-switch
                        label={selectedEvent.isActive ? "Active" : "Inactive"}
                        checked={!!selectedEvent.isActive}
                        disabled={isUpdating}
                        onChange={(e) => setSelectedEvent((prev) => ({ ...prev, isActive: e.target.checked }))}
                    />

                    <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                        <s-button
                            commandFor="edit-event-modal"
                            command="--hide"
                            disabled={isUpdating}
                            onClick={() => setSelectedEvent(null)}
                        >
                            Discard
                        </s-button>
                        <s-button
                            variant="primary"
                            loading={isUpdating}
                            disabled={isUpdating || !selectedEvent.name?.trim() || !selectedEvent.type?.trim()}
                            onClick={handleUpdateEvent}
                            commandFor="edit-event-modal"
                            command="--hide"
                        >
                            Save Changes
                        </s-button>
                    </s-stack>
                </>
            )}
        </s-modal>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — delete modal
    // ─────────────────────────────────────────────────────────────────────────

    const renderDeleteModal = () => (
        <s-modal id="delete-event-modal" heading="Delete Points Event" size="small">
            <s-paragraph color="subdued">
                Are you sure you want to delete <strong>{selectedEvent?.name}</strong>?
                This will also remove any associated points rules. This action cannot be undone.
            </s-paragraph>
            <s-button
                slot="secondary-actions"
                commandFor="delete-event-modal"
                command="--hide"
                disabled={isDeleting}
            >
                Cancel
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                destructive
                loading={isDeleting}
                disabled={isDeleting}
                onClick={handleDeleteEvent}
                commandFor="delete-event-modal"
                command="--hide"
            >
                Yes, Delete
            </s-button>
        </s-modal>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <s-page inlineSize="base">
            <s-section>{renderHeading()}</s-section>

            {showAddForm && renderAddForm()}
            {!showAddForm && renderTable()}

            {renderEditModal()}
            {renderDeleteModal()}
        </s-page>
    );
}