export declare class HttpError extends Error {
    status: number;
    description: string;
    response?: unknown;
    headers?: Record<string, string>;
    constructor(status: number, description?: string, options?: {
        response?: unknown;
        headers?: Record<string, string>;
    });
}
//# sourceMappingURL=errors.d.ts.map