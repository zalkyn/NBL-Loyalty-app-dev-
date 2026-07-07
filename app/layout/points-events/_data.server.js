import prisma from "db-server";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/points-events/_data.server.js";

// ── CREATE ───────────────────────────────────────────────────────────────────

export async function handleAddEvent({ formData, session }) {
    const submitType = "addEvent";

    let newEvent;
    try {
        newEvent = JSON.parse(formData.get("event") || "{}");
    } catch {
        return { message: "Invalid event data.", status: "error", submitType };
    }

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
        logger.error("Create event failed", { module: MODULE, error: err?.message, shop: session.shop });
        const msg = err.code === "P2002"
            ? "An event with this name or type already exists."
            : "Failed to create event. Please try again.";
        return { message: msg, status: "error", submitType };
    }
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function handleUpdateEvent({ formData, session }) {
    const submitType = "updateEvent";

    let updatedEvent;
    try {
        updatedEvent = JSON.parse(formData.get("event") || "{}");
    } catch {
        return { message: "Invalid event data.", status: "error", submitType };
    }

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
        logger.error("Update event failed", { module: MODULE, error: err?.message, shop: session.shop, eventId: updatedEvent.id });
        const msg = err.code === "P2002"
            ? "An event with this name or type already exists."
            : "Failed to update event. Please try again.";
        return { message: msg, status: "error", submitType };
    }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function handleDeleteEvent({ formData, session }) {
    const submitType = "deleteEvent";
    const eventId = parseInt(formData.get("eventId"));
    if (!eventId)
        return { message: "Event ID is required.", status: "error", submitType };

    try {
        await prisma.event.delete({
            where: { id: eventId, sessionId: session.id },
        });
        return { message: "Event deleted successfully.", status: "success", submitType };
    } catch (err) {
        logger.error("Delete event failed", { module: MODULE, error: err?.message, shop: session.shop, eventId });
        return { message: "Failed to delete event. Please try again.", status: "error", submitType };
    }
}
