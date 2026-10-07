import { useEffect, useState, useCallback, useMemo } from "react";
import { useSubmit, useNavigation } from "react-router";
import { useSubmitLock } from "@app/hooks/useSubmitLock";
import { useAppBridge } from "@shopify/app-bridge-react";

import { EMPTY_EVENT, PER_PAGE, findDuplicateEventError, requiredEventErrors } from "./_data";
import { notifyInvalidForm } from "@app/utils/formFeedback";

export function useEventsPage(loaderData, actionData) {
    const submit = useSubmit();
    const navigation = useNavigation();
    const tryLock = useSubmitLock(navigation.state);
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
    // Field errors on the Add form appear only after a Save attempt, then
    // track the fields live so they clear as the merchant fills them in.
    const [addAttempted, setAddAttempted] = useState(false);
    const addErrors = useMemo(
        () => (addAttempted ? requiredEventErrors(newEvent) : {}),
        [addAttempted, newEvent]
    );
    const [selectedEvent, setSelectedEvent] = useState(null); // for edit/delete modals

    // ── Pagination ────────────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);

    const events = loaderData?.events ?? [];
    const totalPages = Math.max(1, Math.ceil(events.length / PER_PAGE));
    const paginatedEvents = events.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    // ── Action data effect ───────────────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });

        if (actionData.status === "success") {
            if (actionData.submitType === "addEvent") {
                setShowAddForm(false);
                setNewEvent({ ...EMPTY_EVENT });
                setAddAttempted(false);
            }
            if (actionData.submitType === "updateEvent" || actionData.submitType === "deleteEvent") {
                setSelectedEvent(null);
            }
        }
    }, [actionData, shopify]);

    useEffect(() => { setCurrentPage(1); }, [events.length]);

    // ── Validation ────────────────────────────────────────────────────────────
    const validateEvent = useCallback((ev, excludeId = null) => {
        const error = findDuplicateEventError(events, ev, excludeId);
        if (error) {
            shopify.toast.show(error, { isError: true });
            return false;
        }
        return true;
    }, [events, shopify]);

    // ── Add-form toggle ───────────────────────────────────────────────────────
    const toggleAddForm = useCallback(() => {
        setNewEvent({ ...EMPTY_EVENT });
        setAddAttempted(false);
        setShowAddForm((prev) => !prev);
    }, []);

    const cancelAddForm = useCallback(() => {
        setShowAddForm(false);
        setNewEvent({ ...EMPTY_EVENT });
        setAddAttempted(false);
    }, []);

    // ── Submit handlers ───────────────────────────────────────────────────────
    const handleAddEvent = useCallback(() => {
        const missing = requiredEventErrors(newEvent);
        if (Object.keys(missing).length > 0) {
            setAddAttempted(true);
            notifyInvalidForm(shopify, missing);
            return;
        }
        if (!validateEvent(newEvent)) return;
        if (!tryLock()) return; // a submit is already in flight (see useSubmitLock)
        submit({ submitType: "addEvent", event: JSON.stringify(newEvent) }, { method: "post" });
    }, [newEvent, submit, validateEvent, shopify]);

    const handleUpdateEvent = useCallback(() => {
        if (!validateEvent(selectedEvent, selectedEvent?.id)) return;
        if (!tryLock()) return; // a submit is already in flight (see useSubmitLock)
        submit({ submitType: "updateEvent", event: JSON.stringify(selectedEvent) }, { method: "post" });
    }, [selectedEvent, submit, validateEvent]);

    const handleDeleteEvent = useCallback(() => {
        if (!selectedEvent) return;
        submit({ submitType: "deleteEvent", eventId: selectedEvent.id }, { method: "post" });
    }, [selectedEvent, submit]);

    return {
        events, paginatedEvents,
        currentPage, totalPages, setCurrentPage,

        isAdding, isUpdating, isDeleting, isAnyBusy,

        showAddForm, toggleAddForm, cancelAddForm,
        newEvent, setNewEvent, addErrors,
        selectedEvent, setSelectedEvent,

        handleAddEvent, handleUpdateEvent, handleDeleteEvent,
    };
}
