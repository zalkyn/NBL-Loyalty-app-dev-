// Client-safe formatting for the Program Health page.

const n = (value) => Number(value ?? 0).toLocaleString("en-US");
export const count = n;

/** "3 minutes ago", "2 hours ago", "5 days ago". Falls back to a date past 30 days. */
export function timeAgo(iso, now = Date.now()) {
    if (!iso) return "never";
    const diff = Math.max(0, now - new Date(iso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days <= 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export const plural = (num, one, many = `${one}s`) => `${n(num)} ${num === 1 ? one : many}`;
