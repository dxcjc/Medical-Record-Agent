export declare const SESSION_COOKIE_NAME = "mra_session";
export declare function readSessionCookie(cookieHeader: string | string[] | undefined, name?: string): string | null;
export declare function serializeSessionCookie(token: string): string;
export declare function serializeClearedSessionCookie(): string;
//# sourceMappingURL=session-cookie.d.ts.map