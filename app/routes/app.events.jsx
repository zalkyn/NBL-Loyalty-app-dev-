

import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const events = await prisma.event.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
    });

    return { events };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ==================== ADD Event ====================
    if (submitType === "addEvent") {
        const newEvent = JSON.parse(formData.get("Event")) || {};

        if (!newEvent.name?.trim() || !newEvent.type?.trim()) {
            return { message: "Name and Type are required.", status: "error", submitType };
        }

        try {
            const createdEvent = await prisma.event.create({
                data: {
                    shop: session.shop,
                    sessionId: session.id,
                    name: newEvent.name.trim(),
                    type: newEvent.type.toUpperCase().trim(),
                    description: newEvent.description?.trim() || null,
                },
            });

            return {
                message: "Points Event created successfully.",
                Event: createdEvent,
                status: "success",
                submitType,
            };
        } catch (error) {
            console.error("Create PointsEvent Error:", error);
            const msg = error.code === "P2002"
                ? "A Event with this Name or Type already exists."
                : "Failed to create points Event.";
            return { message: msg, status: "error", submitType };
        }
    }

    // ==================== DELETE Event ====================
    else if (submitType === "deleteEvent") {
        const EventId = parseInt(formData.get("EventId"));

        if (!EventId) {
            return { message: "Event ID is required.", status: "error", submitType };
        }

        try {
            await prisma.event.delete({
                where: {
                    id: EventId,
                    sessionId: session.id,        // Security
                },
            });
            return { message: "Points Event deleted successfully.", status: "success", submitType };
        } catch (error) {
            return { message: "Failed to delete points Event.", status: "error", submitType };
        }
    }

    // ==================== UPDATE Event ====================
    else if (submitType === "updateEvent") {
        const updatedEvent = JSON.parse(formData.get("Event")) || {};

        if (!updatedEvent.id || !updatedEvent.name?.trim() || !updatedEvent.type?.trim()) {
            return { message: "ID, Name and Type are required.", status: "error", submitType };
        }

        try {
            const Event = await prisma.event.update({
                where: {
                    id: parseInt(updatedEvent.id),
                    sessionId: session.id,        // Security
                },
                data: {
                    name: updatedEvent.name.trim(),
                    type: updatedEvent.type.toUpperCase().trim(),
                    description: updatedEvent.description?.trim() || null,
                    isActive: updatedEvent.isActive ?? true,
                },
            });

            return {
                message: "Points Event updated successfully.",
                Event,
                status: "success",
                submitType,
            };
        } catch (error) {
            console.error("Update PointsEvent Error:", error);
            const msg = error.code === "P2002"
                ? "A Event with this Name or Type already exists."
                : "Failed to update points Event.";
            return { message: msg, status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ====================== COMPONENT ======================
export default function Events() {
    const submit = useSubmit();
    const shopify = useAppBridge();
    const { events } = useLoaderData();
    const actionData = useActionData();

    const [selectedEvent, setSelectedEvent] = useState(null);
    const [toggleAddEvent, setToggleAddEvent] = useState(false);

    const emptyEvent = {
        name: "",
        type: "",
        description: "",
        isActive: true,
    };

    const [newEvent, setNewEvent] = useState(emptyEvent);

    const [loadingButton, setLoadingButton] = useState({
        addEvent: false,
        deleteEvent: false,
        updateEvent: false,
    });

    // Handle Action Response
    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, {
                isError: actionData.status === "error",
            });
        }

        // Reset all loading states
        setLoadingButton({
            addEvent: false,
            deleteEvent: false,
            updateEvent: false,
        });

        if (actionData?.status === "success") {
            if (actionData.submitType === "addEvent") {
                setToggleAddEvent(false);
                setNewEvent(emptyEvent);
            } else if (actionData.submitType === "deleteEvent" || actionData.submitType === "updateEvent") {
                setSelectedEvent(null);
            }
        }
    }, [actionData]);

    // ==================== HANDLERS ====================
    const handleToggleAddEvent = () => {
        setToggleAddEvent((prev) => !prev);
        if (!toggleAddEvent) {
            setNewEvent(emptyEvent);
        }
    };

    const normalize = (val) => val?.trim().toLowerCase();

    const handleValidation = (Event) => {
        if (!Event?.name?.trim() || !Event?.type?.trim()) {
            shopify.toast.show("Name and Type are required.");
            return false;
        }

        const name = normalize(Event.name);
        const type = normalize(Event.type);

        const isDuplicateName = events.some(
            (src) => src.id !== selectedEvent?.id && normalize(src.name) === name
        );

        const isDuplicateType = events.some(
            (src) => src.id !== selectedEvent?.id && normalize(src.type) === type
        );

        if (isDuplicateName) {
            shopify.toast.show("A points Event with this name already exists.");
            return false;
        }
        if (isDuplicateType) {
            shopify.toast.show("A points Event with this type already exists.");
            return false;
        }

        return true;
    };

    const handleSaveEvent = () => {
        if (!handleValidation(newEvent)) return;

        setLoadingButton((prev) => ({ ...prev, addEvent: true }));

        submit(
            {
                submitType: "addEvent",
                Event: JSON.stringify(newEvent),
            },
            { method: "post" }
        );
    };

    const handleDeleteEvent = () => {
        if (!selectedEvent) return;

        setLoadingButton((prev) => ({ ...prev, deleteEvent: true }));

        submit(
            {
                submitType: "deleteEvent",
                EventId: selectedEvent.id,
            },
            { method: "post" }
        );
    };

    const handleUpdateEvent = () => {
        if (!handleValidation(selectedEvent)) return;

        setLoadingButton((prev) => ({ ...prev, updateEvent: true }));

        submit(
            {
                submitType: "updateEvent",
                Event: JSON.stringify(selectedEvent),
            },
            { method: "post" }
        );
    };

    return (
        <s-page inlineSize="base">
            {/* Header */}
            <s-section>
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <h2 style={{ marginBlock: "0" }}>Points Events Management</h2>
                    <s-button
                        onClick={handleToggleAddEvent}
                        icon={toggleAddEvent ? "minus" : "plus"}
                        variant={toggleAddEvent ? "auto" : "primary"}
                    >
                        {toggleAddEvent ? "Cancel" : "Add New Event"}
                    </s-button>
                </s-grid>
            </s-section>

            {/* Add New Event Form */}
            {toggleAddEvent && (
                <s-section>
                    <h3 style={{ marginBlock: "0" }}>Add New Event</h3>
                    <s-box paddingBlock="base">
                        <s-divider />
                    </s-box>

                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-text-field
                            label="Event Name *"
                            value={newEvent.name}
                            onInput={(e) => setNewEvent((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g., Order Reward"
                        />
                        <s-text-field
                            label="Event Type *"
                            value={newEvent.type}
                            onInput={(e) => setNewEvent((prev) => ({ ...prev, type: e.target.value?.toUpperCase() }))}
                            placeholder="e.g., ORDER"
                        />
                    </s-grid>

                    <s-box paddingBlockEnd="base" />
                    <s-text-area
                        label="Description"
                        value={newEvent.description}
                        onInput={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="Optional description for this points Event"
                    />

                    <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                        <s-button onClick={handleToggleAddEvent}>Cancel</s-button>
                        <s-button
                            variant="primary"
                            onClick={handleSaveEvent}
                            disabled={loadingButton.addEvent || !newEvent.name?.trim() || !newEvent.type?.trim()}
                            loading={loadingButton.addEvent}
                        >
                            Save Event
                        </s-button>
                    </s-stack>
                </s-section>
            )}

            {/* events Table */}
            {!toggleAddEvent && (
                <s-section>
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Name</s-table-header>
                            <s-table-header>Type</s-table-header>
                            <s-table-header>Description</s-table-header>
                            <s-table-header>Active</s-table-header>
                            <s-table-header>Created At</s-table-header>
                            <s-table-header>Actions</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {events.length === 0 ? (
                                <s-table-row>
                                    <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                        No points events yet. Click "Add New Event" to create one.
                                    </s-table-cell>
                                </s-table-row>
                            ) : (
                                events.map((Event) => (
                                    <s-table-row key={Event.id}>
                                        <s-table-cell>{Event.name}</s-table-cell>
                                        <s-table-cell>{Event.type}</s-table-cell>
                                        <s-table-cell>{Event.description || "—"}</s-table-cell>
                                        <s-table-cell>{Event.isActive ? "Yes" : "No"}</s-table-cell>
                                        <s-table-cell>
                                            {new Date(Event.createdAt).toLocaleDateString()}
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-stack gap="small" direction="inline">
                                                <s-button
                                                    variant="text"
                                                    size="small"
                                                    icon="edit"
                                                    onClick={() => setSelectedEvent({ ...Event })}
                                                    commandFor="edit-modal"
                                                    command="--show"
                                                />
                                                <s-button
                                                    variant="text"
                                                    size="small"
                                                    icon="delete"
                                                    destructive
                                                    onClick={() => setSelectedEvent(Event)}
                                                    commandFor="delete-modal"
                                                    command="--show"
                                                />
                                            </s-stack>
                                        </s-table-cell>
                                    </s-table-row>
                                ))
                            )}
                        </s-table-body>
                    </s-table>
                </s-section>
            )}

            {/* Delete Modal */}
            <s-modal id="delete-modal" heading="Delete Points Event" size="small">
                <s-paragraph color="subdued">
                    Are you sure you want to delete this points Event? This action cannot be undone.
                </s-paragraph>
                <s-button slot="secondary-actions" commandFor="delete-modal" command="--hide">
                    Cancel
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    destructive
                    onClick={handleDeleteEvent}
                    commandFor="delete-modal"
                    command="--hide"
                >
                    Yes, Delete
                </s-button>
            </s-modal>

            {/* Edit Modal */}
            <s-modal id="edit-modal" heading="Edit Points Event" size="base">
                {selectedEvent && (
                    <>
                        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                            <s-text-field
                                label="Name *"
                                value={selectedEvent.name || ""}
                                onInput={(e) => setSelectedEvent((prev) => ({ ...prev, name: e.target.value }))}
                            />
                            <s-text-field
                                label="Type *"
                                value={selectedEvent.type || ""}
                                onInput={(e) => setSelectedEvent((prev) => ({ ...prev, type: e.target.value?.toUpperCase() }))}
                            />
                        </s-grid>

                        <s-box paddingBlockEnd="base" />
                        <s-text-area
                            label="Description"
                            value={selectedEvent.description || ""}
                            onInput={(e) => setSelectedEvent((prev) => ({ ...prev, description: e.target.value }))}
                        />

                        <s-box paddingBlockEnd="base" />
                        <s-switch
                            label="Active Status"
                            checked={!!selectedEvent.isActive}
                            onChange={(e) => setSelectedEvent((prev) => ({ ...prev, isActive: e.target.checked }))}
                        />

                        <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                            <s-button
                                variant="base"
                                commandFor="edit-modal"
                                command="--hide"
                                onClick={() => setSelectedEvent(null)}
                            >
                                Discard
                            </s-button>
                            <s-button
                                variant="primary"
                                onClick={handleUpdateEvent}
                                disabled={loadingButton.updateEvent || !selectedEvent.name?.trim() || !selectedEvent.type?.trim()}
                                loading={loadingButton.updateEvent}
                                commandFor="edit-modal"
                                command="--hide"
                            >
                                Save Changes
                            </s-button>
                        </s-stack>
                    </>
                )}
            </s-modal>
        </s-page>
    );
}

