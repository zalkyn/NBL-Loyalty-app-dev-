const APP_NAME = 'NBL';

const isDev = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isDev ? 'debug' : 'warn');

const LEVELS = {
    debug: 10,
    info: 20,
    success: 25,
    warn: 30,
    error: 40
};

const EMOJIS = {
    debug: '🔍',
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌'
};

// ---------------------------
// Utils
// ---------------------------
const shouldLog = (level) =>
    LEVELS[level] >= LEVELS[LOG_LEVEL];

const parseShop = (args) => {
    if (typeof args[0] === 'string' && args[0].includes('myshopify.com')) {
        return { shop: args[0], rest: args.slice(1) };
    }
    return { shop: null, rest: args };
};

const normalizeExtras = (extras) => {
    return extras.reduce((acc, item, i) => {
        if (item instanceof Error) {
            acc.error = item.message;
            acc.stack = isDev ? item.stack : undefined;
        } else if (typeof item === 'object') {
            Object.assign(acc, item);
        } else {
            acc[`extra${i + 1}`] = item;
        }
        return acc;
    }, {});
};

// ---------------------------
// Core Logger
// ---------------------------
function logMessage(level, ...args) {
    if (!shouldLog(level)) return;

    const { shop, rest } = parseShop(args);
    const message = rest[0] || '(no message)';
    const extras = normalizeExtras(rest.slice(1));

    const payload = {
        app: APP_NAME,
        level,
        time: new Date().toISOString(),
        shop,
        message,
        ...extras
    };

    // 👉 Dev = pretty log
    if (isDev) {
        const emoji = EMOJIS[level] || '→';
        console[level === 'error' ? 'error' : 'log'](
            `## [${APP_NAME}] ${emoji} [${level.toUpperCase()}] ${shop ? `[${shop}] ` : ''}${message}`
        );

        if (Object.keys(extras).length) {
            console.log(extras);
        }
    }

    // 👉 Prod = structured JSON (VERY IMPORTANT)
    else {
        const method =
            level === 'error' ? 'error' :
                level === 'warn' ? 'warn' :
                    'log';

        console[method](JSON.stringify(payload));
    }
}

// ---------------------------
// Export
// ---------------------------
export const logger = {
    debug: (...a) => logMessage('debug', ...a),
    info: (...a) => logMessage('info', ...a),
    success: (...a) => logMessage('success', ...a),
    warn: (...a) => logMessage('warn', ...a),
    error: (...a) => logMessage('error', ...a)
};