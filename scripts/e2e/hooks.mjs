// Node module-resolution hook for the end-to-end run: maps the app's Vite
// aliases (db-server, @controller, app/…) to real paths and swaps the real
// Shopify client (app/shopify.server.js) for a stub that hands the jobs a fake
// admin. Nothing in the app itself changes.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STUB = pathToFileURL(path.join(root, "scripts/e2e/stub-shopify.mjs")).href;
const ALIASES = [
    ["shopify-server", "app/shopify.server.js"], ["db-server", "app/db.server.js"],
    ["@controller/", "app/controller/"], ["@graphql/", "app/graphql/"], ["@utils/", "app/utils/"],
    ["@app/", "app/"], ["app/", "app/"],
];

const withExt = (p) => {
    for (const c of [p, `${p}.js`, `${p}.jsx`, path.join(p, "index.js")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return p;
};

export async function resolve(specifier, context, next) {
    for (const [prefix, target] of ALIASES) {
        if (specifier === prefix || specifier.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`) || (!prefix.endsWith("/") && specifier === prefix)) {
            const rest = specifier === prefix ? "" : specifier.slice(prefix.length);
            const full = withExt(path.join(root, target, rest));
            if (fs.existsSync(full)) specifier = pathToFileURL(full).href;
            break;
        }
    }
    // The app (bundled by Vite) leaves extensions off relative imports; Node needs them.
    if (/^\.\.?\//.test(specifier) && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
        const full = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
        if (fs.existsSync(full) && fs.statSync(full).isFile()) specifier = pathToFileURL(full).href;
    }
    const r = await next(specifier, context);
    if (r.url.endsWith("/app/shopify.server.js")) return { url: STUB, shortCircuit: true };
    return r;
}
