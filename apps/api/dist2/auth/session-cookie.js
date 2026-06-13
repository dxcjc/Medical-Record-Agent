export const SESSION_COOKIE_NAME = "mra_session";
function splitCookieHeader(value) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => item.split(";"));
    }
    return value ? value.split(";") : [];
}
export function readSessionCookie(cookieHeader, name = SESSION_COOKIE_NAME) {
    for (const part of splitCookieHeader(cookieHeader)) {
        const [rawKey, ...rawValueParts] = part.trim().split("=");
        if (rawKey !== name) {
            continue;
        }
        const rawValue = rawValueParts.join("=");
        if (!rawValue) {
            return null;
        }
        try {
            return decodeURIComponent(rawValue);
        }
        catch {
            return rawValue;
        }
    }
    return null;
}
export function serializeSessionCookie(token) {
    return [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax"
    ].join("; ");
}
export function serializeClearedSessionCookie() {
    return [
        `${SESSION_COOKIE_NAME}=`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=0"
    ].join("; ");
}
//# sourceMappingURL=session-cookie.js.map