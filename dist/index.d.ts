import http from 'http';
type Flows = any;
interface CorsOptions {
    origin?: string | string[] | boolean;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
interface SecurityHeadersConfig {
    hsts?: string | false;
    contentTypeOptions?: boolean;
    frameOptions?: string | false;
    referrerPolicy?: string | false;
    permissionsPolicy?: string | false;
    contentSecurityPolicy?: string | false;
}
declare class HttpTrigger {
    private flows;
    private routes;
    private corsOptions;
    private securityHeaders;
    private staticPath?;
    private unsafe;
    constructor(flows: Flows, unsafe: any, corsOptions?: CorsOptions, staticPath?: string, securityHeaders?: boolean | Partial<SecurityHeadersConfig>);
    private parseRoutePattern;
    private extractParams;
    private findMatchingRoute;
    private handleCors;
    private setCorsHeaders;
    private setSecurityHeaders;
    private serveStaticFile;
    registerFolder(folder: string): Promise<void>;
    private _registerFolder;
    listen(port: number): void;
}
export default HttpTrigger;
export declare function handleJson(data: {}, unsafe: {
    req: http.IncomingMessage;
    res: http.ServerResponse;
}): Promise<unknown>;
export declare function handleUrlEncodedExtended(data: {}, unsafe: {
    req: http.IncomingMessage;
    res: http.ServerResponse;
}): Promise<unknown>;
export declare class HttpError extends Error {
    status?: number;
    description?: string;
    constructor(status: number, description?: string);
}
//# sourceMappingURL=index.d.ts.map