import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { DS, PAGE_TYPE_OPTIONS } from "../constants/cssVarsConfig";
import { getConfigValue, getConfigDefault } from "../_data";
import { FieldWrapper } from "./FieldWrapper";
import { FieldLabel } from "./FieldLabel";

const MODE_OPTIONS = [
    { value: "hideOn", label: "Hide on selected" },
    { value: "showOnly", label: "Show only on selected" },
];

const SEARCH_DEBOUNCE_MS = 300;
// Beyond this many selected chips, collapse the rest behind "+N more" —
// keeps the card a fixed, scannable height even with a long pick list.
const CHIPS_COLLAPSE_AT = 6;

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG PAGE PICKER FIELD
//
// "Show widget on" — mode toggle (hideOn/showOnly) + a searchable multi-
// select of the shop's Online Store Pages, so the merchant picks pages by
// title instead of typing a handle/URL. Search hits handleSearchPages via
// its own useFetcher — deliberately NOT the page's main useSubmit(), so
// typing a search query never marks the whole Customize page "submitting"
// or interferes with save/discard state.
//
// Value shape: { mode: "hideOn" | "showOnly", pages: [{ handle, title }],
// pageTypes: [...PAGE_TYPE_OPTIONS values] }. `pages` and `pageTypes` are
// OR'd together into a single "matched" set before `mode` decides what that
// means on the storefront — see loyalty.liquid.
// Whole-object dirty check (plain !== from ConfigSelectField/ConfigTextField
// doesn't work here — this value is an object, so it's a new reference on
// every render regardless of content).
// ─────────────────────────────────────────────────────────────────────────────

export function ConfigPagePickerField({ field, widgetConfig, onChange, disabled }) {
    const rawValue = getConfigValue(widgetConfig, field.configKey, field.default);
    const defaultValue = getConfigDefault(field.configKey);
    // Normalize BEFORE the dirty check: configs saved before `pageTypes`
    // shipped have no such key at all, and `{mode, pages}` vs.
    // `{mode, pages, pageTypes: []}` stringify to different JSON even though
    // they mean the same thing — that mismatch would wrongly badge every
    // existing shop's field "Modified" the moment they open Customize.
    const value = { mode: "hideOn", pages: [], pageTypes: [], ...rawValue };
    const isDirty = JSON.stringify(value) !== JSON.stringify(defaultValue);

    const mode = value.mode;
    const selectedPages = value.pages;
    const selectedTypes = value.pageTypes;

    const [query, setQuery] = useState("");
    const [showResults, setShowResults] = useState(false);
    const [chipsExpanded, setChipsExpanded] = useState(false);
    const searchFetcher = useFetcher();
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

    function emit(next) {
        onChange(field.configKey, { mode, pages: selectedPages, pageTypes: selectedTypes, ...next });
    }

    function toggleType(typeValue) {
        const next = selectedTypes.includes(typeValue)
            ? selectedTypes.filter((t) => t !== typeValue)
            : [...selectedTypes, typeValue];
        emit({ pageTypes: next });
    }

    function handleRevert() { onChange(field.configKey, defaultValue); }

    function runSearch(term) {
        searchFetcher.submit({ intent: "searchPages", search: term }, { method: "post" });
    }

    function handleQueryChange(next) {
        setQuery(next);
        setShowResults(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(next), SEARCH_DEBOUNCE_MS);
    }

    // Load an initial batch (most recent pages) the first time the picker opens.
    function handleFocus() {
        setShowResults(true);
        if (searchFetcher.data === undefined && searchFetcher.state === "idle") runSearch(query);
    }

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    // Click-outside closes the results dropdown.
    useEffect(() => {
        function onDocClick(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) setShowResults(false);
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    const results = (searchFetcher.data?.ok ? searchFetcher.data.pages : []) ?? [];
    const selectedHandles = new Set(selectedPages.map((p) => p.handle));
    const visibleResults = results.filter((r) => !selectedHandles.has(r.handle));
    const isSearching = searchFetcher.state !== "idle";

    function addPage(page) {
        emit({ pages: [...selectedPages, { handle: page.handle, title: page.title }] });
        setQuery("");
        setShowResults(false);
    }

    function removePage(handle) {
        emit({ pages: selectedPages.filter((p) => p.handle !== handle) });
    }

    function clearAll() {
        emit({ pages: [] });
        setChipsExpanded(false);
    }

    const visibleChips = chipsExpanded ? selectedPages : selectedPages.slice(0, CHIPS_COLLAPSE_AT);
    const hiddenChipCount = selectedPages.length - visibleChips.length;
    const totalSelected = selectedPages.length + selectedTypes.length;
    const showEmptySelectionWarning = mode === "showOnly" && totalSelected === 0;

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: DS.sp8 }}>
                <div style={{ flex: 1 }}>
                    <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
                </div>
                {totalSelected > 0 && (
                    <span style={{
                        flexShrink: 0, marginTop: 1,
                        background: DS.accentBg, color: DS.accentText,
                        fontSize: 11, fontWeight: 700, padding: "2px 9px",
                        borderRadius: DS.r99, border: `1px solid ${DS.accentBorder}`,
                        whiteSpace: "nowrap",
                    }}>{totalSelected} selected</span>
                )}
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: DS.sp6, flexWrap: "wrap", marginBottom: DS.sp10 }}>
                {MODE_OPTIONS.map((opt) => {
                    const isActive = mode === opt.value;
                    return (
                        <button
                            key={opt.value}
                            disabled={disabled}
                            onClick={() => emit({ mode: opt.value })}
                            style={{
                                padding: "7px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                                borderRadius: DS.r10,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
                                background: isActive ? DS.accentBg : DS.bgCard,
                                color: isActive ? "#5b21b6" : DS.textSub,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.15s",
                            }}
                        >{opt.label}</button>
                    );
                })}
            </div>

            {/* Footgun guard — "Show only" + nothing picked hides the
                widget everywhere, which is very likely not what was
                intended. */}
            {showEmptySelectionWarning && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: DS.warnBg, border: `1px solid ${DS.warnBorder}`, borderRadius: DS.r8,
                    padding: "7px 10px", fontSize: 12, color: DS.warnText, marginBottom: DS.sp10,
                }}>
                    Nothing picked yet — with "Show only on selected", the widget won't show anywhere until you add at least one page or page type below.
                </div>
            )}

            {/* Selected pages as removable chips, collapsed past CHIPS_COLLAPSE_AT */}
            {selectedPages.length > 0 && (
                <div style={{ marginBottom: DS.sp10 }}>
                    <div style={{ display: "flex", gap: DS.sp6, flexWrap: "wrap" }}>
                        {visibleChips.map((p) => (
                            <span key={p.handle} style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                                borderRadius: DS.r99, padding: "4px 6px 4px 12px",
                                fontSize: 12, fontWeight: 500, color: DS.accentText,
                            }}>
                                {p.title}
                                <button
                                    disabled={disabled}
                                    onClick={() => removePage(p.handle)}
                                    aria-label={`Remove ${p.title}`}
                                    style={{
                                        border: "none", background: "none", cursor: disabled ? "default" : "pointer",
                                        color: DS.accentText, fontSize: 14, lineHeight: 1, padding: "2px 6px",
                                    }}
                                >×</button>
                            </span>
                        ))}
                        {hiddenChipCount > 0 && (
                            <button
                                onClick={() => setChipsExpanded(true)}
                                style={{
                                    border: `1px dashed ${DS.borderMid}`, background: "none", borderRadius: DS.r99,
                                    padding: "4px 12px", fontSize: 12, fontWeight: 500, color: DS.textMuted, cursor: "pointer",
                                }}
                            >+{hiddenChipCount} more</button>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: DS.sp10, marginTop: DS.sp6 }}>
                        {chipsExpanded && selectedPages.length > CHIPS_COLLAPSE_AT && (
                            <button
                                onClick={() => setChipsExpanded(false)}
                                style={{ border: "none", background: "none", padding: 0, fontSize: 11, color: DS.textMuted, cursor: "pointer", textDecoration: "underline" }}
                            >Show less</button>
                        )}
                        <button
                            disabled={disabled}
                            onClick={clearAll}
                            style={{ border: "none", background: "none", padding: 0, fontSize: 11, color: DS.dangerText, cursor: disabled ? "default" : "pointer", textDecoration: "underline" }}
                        >Clear all</button>
                    </div>
                </div>
            )}

            {/* Page types — template-level buckets (all products, all
                collections, cart, etc.), separate from the specific-Page
                picker below. Both lists are OR'd together on the storefront
                before `mode` is applied — see loyalty.liquid. */}
            <div style={{ marginBottom: DS.sp10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DS.textHint, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: DS.sp6 }}>
                    Page types
                </div>
                <div style={{ display: "flex", gap: DS.sp6, flexWrap: "wrap" }}>
                    {PAGE_TYPE_OPTIONS.map((opt) => {
                        const isChecked = selectedTypes.includes(opt.value);
                        return (
                            <button
                                key={opt.value}
                                disabled={disabled}
                                onClick={() => toggleType(opt.value)}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", fontSize: 12, fontWeight: isChecked ? 700 : 500,
                                    borderRadius: DS.r99,
                                    border: `1px solid ${isChecked ? DS.accentBorder : DS.borderLight}`,
                                    background: isChecked ? DS.accentBg : DS.bgCard,
                                    color: isChecked ? DS.accentText : DS.textSub,
                                    cursor: disabled ? "default" : "pointer",
                                    transition: "all 0.15s",
                                }}
                            >
                                {isChecked && <span aria-hidden="true">✓</span>}
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: DS.textHint, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: DS.sp6 }}>
                Specific pages
            </div>

            {/* Search + results dropdown */}
            <div ref={containerRef} style={{ position: "relative" }}>
                <s-search-field
                    label="Search pages"
                    labelAccessibilityVisibility="exclusive"
                    placeholder="Search pages by title…"
                    value={query}
                    onInput={(e) => handleQueryChange(e.target.value)}
                    onFocus={handleFocus}
                    disabled={disabled}
                />
                {showResults && (
                    <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                        background: DS.bgCard, border: `1px solid ${DS.borderMid}`, borderRadius: DS.r10,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.08)", maxHeight: 240, overflowY: "auto",
                    }}>
                        <div style={{
                            padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: DS.textHint,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                        }}>{query.trim() ? "Search results" : "Suggested pages"}</div>

                        {isSearching && (
                            <div style={{ padding: "4px 12px 10px", fontSize: 12, color: DS.textMuted }}>Searching…</div>
                        )}
                        {!isSearching && visibleResults.length === 0 && (
                            <div style={{ padding: "4px 12px 10px", fontSize: 12, color: DS.textMuted }}>
                                {query.trim() ? "No matching pages." : "No pages available."}
                            </div>
                        )}
                        {!isSearching && visibleResults.map((p) => (
                            <button
                                key={p.handle}
                                onClick={() => addPage(p)}
                                style={{
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "8px 12px", fontSize: 13, color: DS.text,
                                    background: "none", border: "none", cursor: "pointer",
                                }}
                            >
                                {p.title}
                                <span style={{ color: DS.textHint, fontSize: 11, marginLeft: 6 }}>/{p.handle}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </FieldWrapper>
    );
}