import http from 'http';
type Flows = any;
interface CorsOptions {
    origin?: string | string[] | boolean;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
declare class HttpTrigger {
    private flows;
    private routes;
    private corsOptions;
    private staticPath?;
    private unsafe;
    constructor(flows: Flows, unsafe: any, corsOptions?: CorsOptions, staticPath?: string);
    private parseRoutePattern;
    private extractParams;
    private findMatchingRoute;
    private handleCors;
    private setCorsHeaders;
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
//# sourceMappingURL=index.d.ts.map