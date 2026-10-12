import http from 'http';
import { CorsOptions, SecurityHeaders } from './headers';
export { HttpError } from './errors';
export { handleJson, handleUrlEncodedExtended, readBody } from './body';
export type { CorsOptions, SecurityHeaders } from './headers';
interface FlowsLike {
    execute(flowName: string, input: unknown, unsafe?: unknown): Promise<unknown>;
}
export type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>;
export interface HttpTriggerOptions {
    cors?: CorsOptions | false;
    securityHeaders?: SecurityHeaders | false;
    staticPath?: string;
    apiPrefix?: string;
    handlers?: RequestHandler[];
    notFoundFlow?: string;
}
export interface HttpTriggerDeclaration {
    type: 'http';
    method?: string;
    path?: string;
}
export interface FlowResult {
    status?: number;
    response?: unknown;
    headers?: Record<string, string>;
    redirect?: string;
    httpSent?: boolean;
}
export declare class HttpTrigger {
    private readonly flows;
    private readonly unsafe;
    private readonly router;
    private readonly cors;
    private readonly security;
    private readonly staticPath?;
    private readonly apiPrefix;
    private readonly handlers;
    private readonly notFoundFlow;
    private server?;
    constructor(flows: FlowsLike, unsafe: Record<string, unknown>, options?: HttpTriggerOptions);
    constructor(flows: FlowsLike, unsafe: Record<string, unknown>, cors?: CorsOptions, staticPath?: string, securityHeaders?: boolean | SecurityHeaders);
    register(method: string, routePath: string, flowName: string): void;
    registerFolder(folder: string): Promise<void>;
    routes(): Array<{
        method: string;
        pattern: string;
        flowName: string;
    }>;
    handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    private runFlow;
    private resultFromError;
    private send;
    listen(port: number, callback?: () => void): http.Server;
    close(): Promise<void>;
}
export default HttpTrigger;
//# sourceMappingURL=index.d.ts.map