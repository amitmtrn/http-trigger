import type http from 'http';
export interface CorsOptions {
    origin?: string | string[] | boolean;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
export declare const DEFAULT_CORS: Required<CorsOptions>;
export interface SecurityHeaders {
    hsts?: string | false;
    contentTypeOptions?: boolean;
    frameOptions?: string | false;
    referrerPolicy?: string | false;
    permissionsPolicy?: string | false;
    contentSecurityPolicy?: string | false;
}
export declare const DEFAULT_SECURITY_HEADERS: SecurityHeaders;
export declare function applyCors(res: http.ServerResponse, cors: Required<CorsOptions>, requestOrigin?: string): void;
export declare function applySecurityHeaders(res: http.ServerResponse, h: SecurityHeaders): void;
//# sourceMappingURL=headers.d.ts.map