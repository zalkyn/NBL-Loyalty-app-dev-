/**
 * @file utils/csv.server.js
 * @description Shared CSV building for this app's export routes.
 *
 * Replaces the csvField() that was copy-pasted into
 * dev-config/points-backfill/export/route.jsx and
 * ../preview-export/route.jsx. Six duplicated lines were defensible while
 * they only escaped quotes; once formula neutralisation and BOM handling
 * are in the mix, two copies means one of them eventually drifts and only
 * one export is safe.
 */

/** Values containing these must be wrapped in quotes to survive a parser. */
const NEEDS_QUOTING = /[",\r\n]/;

/**
 * Leading characters that make Excel, LibreOffice and Google Sheets treat
 * a cell as a formula rather than text.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** A value that only looks dangerous because it's a negative number. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Escapes one field.
 *
 * Two separate jobs, in order:
 *
 * 1. FORMULA INJECTION. These exports contain customer names and emails,
 *    which are attacker-controlled — a customer can set their own name in
 *    checkout. A name of `=HYPERLINK("http://evil","Click")` is inert in
 *    the database and in the app's UI, but the moment a merchant opens the
 *    CSV in Excel it becomes a live formula running under their account.
 *    Prefixing with an apostrophe forces the cell to text; the apostrophe
 *    isn't displayed by the spreadsheet.
 *
 *    Genuine negative numbers are exempt, or every refunded amount would
 *    import as text and stop summing.
 *
 * 2. QUOTING. Wraps in double quotes and doubles any internal quote when
 *    the value contains a comma, quote or newline — otherwise one name
 *    with a comma in it silently shifts every column to its right.
 */
export function csvField(value) {
    let str = value == null ? "" : String(value);

    if (FORMULA_TRIGGER.test(str) && !PLAIN_NUMBER.test(str)) {
        str = `'${str}`;
    }

    if (NEEDS_QUOTING.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

/**
 * Builds the CSV body from a header array and an array of row arrays.
 *
 * Lines end in \r\n per the format's own spec — most consumers tolerate
 * \n-only, but \r\n is the one that's universally correct.
 */
export function buildCsv(header, rows) {
    const lines = [header.map(csvField).join(",")];

    for (const row of rows) {
        lines.push(row.map(csvField).join(","));
    }

    return lines.join("\r\n") + "\r\n";
}

/**
 * Strips anything that would break the Content-Disposition header or let
 * a filename escape the downloads folder. Names are already built from
 * app-controlled values, so this is a backstop rather than the only
 * defence.
 */
function safeFilename(name, fallback = "export.csv") {
    const cleaned = String(name ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/["\\/:*?<>|]/g, "-")
        .trim();

    return cleaned || fallback;
}

/**
 * Wraps a CSV body in a download response.
 *
 * The leading U+FEFF is what makes Excel read the file as UTF-8. Without
 * it Excel falls back to the system's legacy codepage and every
 * non-ASCII customer name arrives as mojibake — which for a shop with
 * Bengali, Arabic or accented Latin names is most of the file.
 *
 * no-store because these responses carry names, emails and phone numbers;
 * nosniff so a browser can't decide to render one as HTML instead.
 */
export function csvDownloadResponse(csv, filename) {
    return new Response("\uFEFF" + csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

/**
 * Failures answer in plain text, never CSV — useCsvDownload() checks the
 * content type precisely so an error page can never be saved to disk as a
 * .csv file the merchant then opens expecting data.
 */
export function csvErrorResponse(message, status = 400) {
    return new Response(message, {
        status,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
        },
    });
}
