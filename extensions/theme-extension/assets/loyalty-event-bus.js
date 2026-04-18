// =========================
// EVENT BUS
// =========================
class NBLEventBus {
    constructor() {
        this.listeners = {};
    }

    // ON (sync or async + priority)
    on(event, handler, options = {}) {
        const type = options.type || "sync";
        const priority = options.priority || 0;

        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }

        this.listeners[event].push({ handler, type, priority });

        this.listeners[event].sort((a, b) => b.priority - a.priority);

        return this;
    }

    // OFF
    off(event, handler) {
        if (!this.listeners[event]) return this;

        this.listeners[event] = this.listeners[event]
            .filter(h => h.handler !== handler);

        return this;
    }

    // ONCE
    once(event, handler, options = {}) {
        const type = options.type || "sync";

        const wrapper = (data) => {
            handler(data);
            this.off(event, wrapper);
        };

        return this.on(event, wrapper, { type });
    }

    // EMIT (sync + async + wildcard)
    async emit(event, data, options = {}) {
        const mode = options.mode || "sync";

        const run = async (list) => {
            for (const item of list) {
                try {
                    if (item.type === "async") {
                        await item.handler(data);
                    } else {
                        item.handler(data);
                    }
                } catch (e) {
                    log("❌ Error: " + e.message);
                }
            }
        };

        const handlers = this.listeners[event] || [];
        const wildcards = this.listeners["*"] || [];

        if (mode === "async") {
            await run(handlers);
            await run(wildcards);
        } else {
            run(handlers);
            run(wildcards);
        }

        return this;
    }

    clear(event) {
        if (event) delete this.listeners[event];
        else this.listeners = {};
    }

    getListeners() {
        return this.listeners;
    }
}
