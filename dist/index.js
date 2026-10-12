"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpTrigger = exports.readBody = exports.handleUrlEncodedExtended = exports.handleJson = exports.HttpError = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const debug_1 = __importDefault(require("debug"));
const router_1 = require("./router");
const headers_1 = require("./headers");
const static_1 = require("./static");
const errors_1 = require("./errors");
var errors_2 = require("./errors");
Object.defineProperty(exports, "HttpError", { enumerable: true, get: function () { return errors_2.HttpError; } });
var body_1 = require("./body");
Object.defineProperty(exports, "handleJson", { enumerable: true, get: function () { return body_1.handleJson; } });
Object.defineProperty(exports, "handleUrlEncodedExtended", { enumerable: true, get: function () { return body_1.handleUrlEncodedExtended; } });
Object.defineProperty(exports, "readBody", { enumerable: true, get: function () { return body_1.readBody; } });
const log = (0, debug_1.default)('http-trigger');
function isLegacyCors(value) {
    return !!value && typeof value === 'object' && ['origin', 'methods', 'allowedHeaders', 'credentials', 'maxAge'].some((k) => k in value);
}
class HttpTrigger {
    flows;
    unsafe;
    router = new router_1.Router();
    cors;
    security;
    staticPath;
    apiPrefix;
    handlers;
    notFoundFlow;
    server;
    constructor(flows, unsafe, third, legacyStaticPath, legacySecurity) {
        this.flows = flows;
        this.unsafe = unsafe;
        const options = isLegacyCors(third) || legacyStaticPath !== undefined || legacySecurity !== undefined
            ? { cors: third, staticPath: legacyStaticPath, securityHeaders: legacySecurity === false ? false : (typeof legacySecurity === 'object' ? legacySecurity : undefined) }
            : third || {};
        this.cors = options.cors === false ? false : { ...headers_1.DEFAULT_CORS, ...(options.cors || {}) };
        this.security = options.securityHeaders === false ? false : { ...headers_1.DEFAULT_SECURITY_HEADERS, ...(options.securityHeaders || {}) };
        this.staticPath = options.staticPath;
        this.apiPrefix = (options.apiPrefix ?? '/api').replace(/\/$/, '');
        this.handlers = options.handlers || [];
        this.notFoundFlow = options.notFoundFlow || 'not-found';
    }
    register(method, routePath, flowName) {
        const full = `${this.apiPrefix}/${routePath.replace(/^\/+/, '')}`;
        log(`route ${method.toUpperCase()} ${full} -> ${flowName}`);
        this.router.register(method, full, flowName);
    }
    async registerFolder(folder) {
        const walk = async (dir) => {
            const entries = await fs_1.default.promises.readdir(dir, { withFileTypes: true });
            await Promise.all(entries.map(async (entry) => {
                const filePath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory())
                    return walk(filePath);
                if (!/\.(js|ts|mjs|cjs)$/.test(entry.name) || /\.d\.ts$/.test(entry.name))
                    return;
                const mod = await Promise.resolve(`${filePath}`).then(s => __importStar(require(s)));
                const triggers = Array.isArray(mod?.triggers) ? mod.triggers : [];
                const flowName = path_1.default.relative(folder, filePath).replace(/\.[^.]+$/, '').split(path_1.default.sep).join('/');
                for (const t of triggers) {
                    if (t?.type !== 'http')
                        continue;
                    this.register(t.method || 'GET', t.path || flowName, flowName);
                }
            }));
        };
        await walk(folder);
    }
    routes() {
        return this.router.list();
    }
    async handle(req, res) {
        log(`${req.method} ${req.url}`);
        if (this.security)
            (0, headers_1.applySecurityHeaders)(res, this.security);
        if (this.cors) {
            (0, headers_1.applyCors)(res, this.cors, req.headers.origin);
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
        }
        for (const handler of this.handlers) {
            if (await handler(req, res))
                return;
        }
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const isApi = url.pathname === this.apiPrefix || url.pathname.startsWith(this.apiPrefix + '/');
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        if (this.staticPath && isRead && !isApi) {
            if (await (0, static_1.serveStatic)(this.staticPath, url.pathname, req, res))
                return;
        }
        const match = this.router.match(req.method || 'GET', url.pathname);
        if (!match) {
            if (this.staticPath && isRead && !isApi) {
                if (await (0, static_1.serveStatic)(this.staticPath, '/index.html', req, res))
                    return;
            }
            await this.runFlow(this.notFoundFlow, {}, url, req, res);
            return;
        }
        await this.runFlow(match.flowName, match.params, url, req, res);
    }
    async runFlow(flowName, params, url, req, res) {
        const query = Object.fromEntries(url.searchParams);
        const result = await this.flows
            .execute(flowName, { params, query, headers: req.headers }, { ...this.unsafe, req, res })
            .catch((err) => this.resultFromError(err));
        this.send(res, result || {});
    }
    resultFromError(err) {
        log(err);
        if (err instanceof errors_1.HttpError || (typeof err === 'object' && err !== null && 'status' in err)) {
            const e = err;
            return { status: e.status || 500, response: e.response ?? (e.description || 'Internal server error'), headers: e.headers };
        }
        return { status: 500, response: 'Internal server error' };
    }
    send(res, result) {
        const { status, response, redirect, headers, httpSent } = result;
        if (httpSent)
            return;
        if (headers)
            for (const [k, v] of Object.entries(headers))
                res.setHeader(k, v);
        if (redirect) {
            res.writeHead(302, { Location: redirect });
            res.end();
            return;
        }
        const r = response;
        if (r && typeof r === 'object' && r.type === 'Buffer' && Array.isArray(r.data)) {
            res.writeHead(status || 200);
            res.end(Buffer.from(r.data));
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(status || 200);
        res.end(JSON.stringify(response ?? null));
    }
    listen(port, callback) {
        this.server = http_1.default.createServer((req, res) => {
            this.handle(req, res).catch((err) => {
                log('unhandled', err);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                }
                res.end(JSON.stringify('Internal server error'));
            });
        });
        return this.server.listen(port, callback);
    }
    close() {
        return new Promise((resolve, reject) => {
            if (!this.server || !this.server.listening)
                return resolve();
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
    }
}
exports.HttpTrigger = HttpTrigger;
exports.default = HttpTrigger;
//# sourceMappingURL=index.js.map