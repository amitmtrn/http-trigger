/**
 * @codeinkit/http-trigger — turns HTTP requests into flow executions.
 *
 * A flow file opts in by exporting a trigger:
 *   export const triggers = [{ type: 'http', method: 'POST', path: 'stories/:id' }];
 * `registerFolder` scans a folder for those and maps `POST /api/stories/:id` to the flow named
 * by the file's path relative to the folder (the same name `flows.registerFolder` gives it).
 *
 * The flow receives `{ params, query, headers }` as data and `{ ...unsafe, req, res }` as its
 * context, and returns `{ status?, response?, headers?, redirect?, httpSent? }`.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import debug from 'debug';
import { Router } from './router';
import { applyCors, applySecurityHeaders, CorsOptions, DEFAULT_CORS, DEFAULT_SECURITY_HEADERS, SecurityHeaders } from './headers';
import { serveStatic } from './static';
import { HttpError } from './errors';

export { HttpError } from './errors';
export { handleJson, handleUrlEncodedExtended, readBody } from './body';
export type { CorsOptions, SecurityHeaders } from './headers';

const log = debug('http-trigger');

interface FlowsLike {
    execute(flowName: string, input: unknown, unsafe?: unknown): Promise<unknown>;
}

/** Runs before routing. Return true when the request was fully handled. */
export type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>;

export interface HttpTriggerOptions {
    /** CORS headers; `false` sends none. Default allows `*`. */
    cors?: CorsOptions | false;
    /** Security headers; `false` sends none. Defaults are strict (HSTS, nosniff, DENY framing). */
    securityHeaders?: SecurityHeaders | false;
    /** Folder served for GET requests outside the API prefix; unknown paths fall back to its index.html (SPA). */
    staticPath?: string;
    /** Path prefix for routes. Default `/api`. */
    apiPrefix?: string;
    /** Handlers tried before static files and routes, in order (health probes, proxies, well-known files). */
    handlers?: RequestHandler[];
    /** Flow executed when no route matches under the API prefix. Default `not-found`. */
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

function isLegacyCors(value: unknown): value is CorsOptions {
    return !!value && typeof value === 'object' && ['origin', 'methods', 'allowedHeaders', 'credentials', 'maxAge'].some((k) => k in (value as object));
}

export class HttpTrigger {
    private readonly router = new Router();
    private readonly cors: Required<CorsOptions> | false;
    private readonly security: SecurityHeaders | false;
    private readonly staticPath?: string;
    private readonly apiPrefix: string;
    private readonly handlers: RequestHandler[];
    private readonly notFoundFlow: string;
    private server?: http.Server;

    constructor(flows: FlowsLike, unsafe: Record<string, unknown>, options?: HttpTriggerOptions);
    /** @deprecated positional form kept for 1.x callers: (flows, unsafe, cors, staticPath, securityHeaders) */
    constructor(flows: FlowsLike, unsafe: Record<string, unknown>, cors?: CorsOptions, staticPath?: string, securityHeaders?: boolean | SecurityHeaders);
    constructor(
        private readonly flows: FlowsLike,
        private readonly unsafe: Record<string, unknown>,
        third?: HttpTriggerOptions | CorsOptions,
        legacyStaticPath?: string,
        legacySecurity?: boolean | SecurityHeaders,
    ) {
        const options: HttpTriggerOptions = isLegacyCors(third) || legacyStaticPath !== undefined || legacySecurity !== undefined
            ? { cors: third as CorsOptions, staticPath: legacyStaticPath, securityHeaders: legacySecurity === false ? false : (typeof legacySecurity === 'object' ? legacySecurity : undefined) }
            : (third as HttpTriggerOptions) || {};
        this.cors = options.cors === false ? false : { ...DEFAULT_CORS, ...(options.cors || {}) };
        this.security = options.securityHeaders === false ? false : { ...DEFAULT_SECURITY_HEADERS, ...(options.securityHeaders || {}) };
        this.staticPath = options.staticPath;
        this.apiPrefix = (options.apiPrefix ?? '/api').replace(/\/$/, '');
        this.handlers = options.handlers || [];
        this.notFoundFlow = options.notFoundFlow || 'not-found';
    }

    /** Map `method` + `path` (relative to the API prefix, with or without a leading slash) to a flow. */
    register(method: string, routePath: string, flowName: string): void {
        const full = `${this.apiPrefix}/${routePath.replace(/^\/+/, '')}`;
        log(`route ${method.toUpperCase()} ${full} -> ${flowName}`);
        this.router.register(method, full, flowName);
    }

    /** Scan `folder` for flow files exporting an http trigger. The flow name is the file path relative to `folder`, without extension. */
    async registerFolder(folder: string): Promise<void> {
        const walk = async (dir: string): Promise<void> => {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            await Promise.all(entries.map(async (entry) => {
                const filePath = path.join(dir, entry.name);
                if (entry.isDirectory()) return walk(filePath);
                if (!/\.(js|ts|mjs|cjs)$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) return;
                const mod = await import(filePath);
                const triggers: HttpTriggerDeclaration[] = Array.isArray(mod?.triggers) ? mod.triggers : [];
                const flowName = path.relative(folder, filePath).replace(/\.[^.]+$/, '').split(path.sep).join('/');
                for (const t of triggers) {
                    if (t?.type !== 'http') continue;
                    this.register(t.method || 'GET', t.path || flowName, flowName);
                }
            }));
        };
        await walk(folder);
    }

    routes(): Array<{ method: string; pattern: string; flowName: string }> {
        return this.router.list();
    }

    /** The request pipeline: headers → custom handlers → static → route → flow → response. */
    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        log(`${req.method} ${req.url}`);
        if (this.security) applySecurityHeaders(res, this.security);
        if (this.cors) {
            applyCors(res, this.cors, req.headers.origin);
            if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        }
        for (const handler of this.handlers) {
            if (await handler(req, res)) return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const isApi = url.pathname === this.apiPrefix || url.pathname.startsWith(this.apiPrefix + '/');
        const isRead = req.method === 'GET' || req.method === 'HEAD';

        if (this.staticPath && isRead && !isApi) {
            if (await serveStatic(this.staticPath, url.pathname, req, res)) return;
        }

        const match = this.router.match(req.method || 'GET', url.pathname);
        if (!match) {
            if (this.staticPath && isRead && !isApi) {
                if (await serveStatic(this.staticPath, '/index.html', req, res)) return;
            }
            await this.runFlow(this.notFoundFlow, {}, url, req, res);
            return;
        }
        await this.runFlow(match.flowName, match.params, url, req, res);
    }

    private async runFlow(flowName: string, params: Record<string, string>, url: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const query = Object.fromEntries(url.searchParams);
        const result = await this.flows
            .execute(flowName, { params, query, headers: req.headers }, { ...this.unsafe, req, res })
            .catch((err: unknown) => this.resultFromError(err)) as FlowResult | undefined;
        this.send(res, result || {});
    }

    private resultFromError(err: unknown): FlowResult {
        log(err);
        if (err instanceof HttpError || (typeof err === 'object' && err !== null && 'status' in err)) {
            const e = err as HttpError;
            return { status: e.status || 500, response: e.response ?? (e.description || 'Internal server error'), headers: e.headers };
        }
        return { status: 500, response: 'Internal server error' };
    }

    private send(res: http.ServerResponse, result: FlowResult): void {
        const { status, response, redirect, headers, httpSent } = result;
        if (httpSent) return;
        if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        if (redirect) { res.writeHead(302, { Location: redirect }); res.end(); return; }
        const r = response as { type?: string; data?: number[] } | undefined;
        if (r && typeof r === 'object' && r.type === 'Buffer' && Array.isArray(r.data)) {
            res.writeHead(status || 200);
            res.end(Buffer.from(r.data));
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(status || 200);
        res.end(JSON.stringify(response ?? null));
    }

    listen(port: number, callback?: () => void): http.Server {
        this.server = http.createServer((req, res) => {
            this.handle(req, res).catch((err) => {
                log('unhandled', err);
                if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); }
                res.end(JSON.stringify('Internal server error'));
            });
        });
        return this.server.listen(port, callback);
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server || !this.server.listening) return resolve();
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
    }
}

export default HttpTrigger;
