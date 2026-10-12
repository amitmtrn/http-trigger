import type http from 'http';
interface WithReq {
    req: http.IncomingMessage;
}
export declare function readBody(req: http.IncomingMessage, maxBytes?: number): Promise<string>;
export declare function handleJson<T extends object>(data: T, unsafe: WithReq): Promise<T & {
    body: unknown;
}>;
export declare function handleUrlEncodedExtended<T extends object>(data: T, unsafe: WithReq): Promise<T & {
    body: unknown;
}>;
export {};
//# sourceMappingURL=body.d.ts.map