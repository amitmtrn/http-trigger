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
exports.HttpError = void 0;
exports.handleJson = handleJson;
exports.handleUrlEncodedExtended = handleUrlEncodedExtended;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const qs_1 = __importDefault(require("qs"));
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)('http-trigger');
class HttpTrigger {
    flows;
    routes = {
        'not-found': 'not-found'
    };
    corsOptions;
    staticPath;
    unsafe;
    constructor(flows, unsafe, corsOptions, staticPath) {
        this.flows = flows;
        this.unsafe = unsafe;
        this.staticPath = staticPath;
        this.corsOptions = {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            credentials: false,
            maxAge: 86400,
            ...corsOptions
        };
    }
    parseRoutePattern(pattern) {
        const regexPattern = pattern
            .replace(/:[^/]+/g, '([^/]+)')
            .replace(/\//g, '\\/');
        return new RegExp(`^${regexPattern}$`);
    }
    extractParams(pattern, path) {
        const params = {};
        const paramNames = (pattern.match(/:[^/]+/g) || []).map(p => p.slice(1));
        const regex = this.parseRoutePattern(pattern);
        const matches = path.match(regex);
        if (matches) {
            paramNames.forEach((name, index) => {
                params[name] = matches[index + 1];
            });
        }
        return params;
    }
    findMatchingRoute(method, path) {
        const routeKey = `${method} ${path}`;
        if (this.routes[routeKey]) {
            return { route: routeKey, params: {} };
        }
        for (const [routePattern, _flowName] of Object.entries(this.routes)) {
            const [routeMethod, routePath] = routePattern.split(' ', 2);
            if (routeMethod === method) {
                const regex = this.parseRoutePattern(routePath);
                if (regex.test(path)) {
                    const params = this.extractParams(routePath, path);
                    return { route: routePattern, params };
                }
            }
        }
        return null;
    }
    handleCors(req, res) {
        const origin = req.headers.origin;
        if (req.method === 'OPTIONS') {
            this.setCorsHeaders(res, origin);
            res.writeHead(204);
            res.end();
            return true;
        }
        this.setCorsHeaders(res, origin);
        return false;
    }
    setCorsHeaders(res, origin) {
        if (this.corsOptions.origin === true) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
        }
        else if (this.corsOptions.origin === false) {
        }
        else if (Array.isArray(this.corsOptions.origin)) {
            if (origin && this.corsOptions.origin.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', this.corsOptions.origin || '*');
        }
        if (this.corsOptions.methods) {
            res.setHeader('Access-Control-Allow-Methods', this.corsOptions.methods.join(', '));
        }
        if (this.corsOptions.allowedHeaders) {
            res.setHeader('Access-Control-Allow-Headers', this.corsOptions.allowedHeaders.join(', '));
        }
        if (this.corsOptions.credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        if (this.corsOptions.maxAge) {
            res.setHeader('Access-Control-Max-Age', this.corsOptions.maxAge.toString());
        }
    }
    serveStaticFile(req, res) {
        if (!this.staticPath || req.method !== 'GET' || req.url?.startsWith('/api/')) {
            return false;
        }
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const filePath = path_1.default.join(this.staticPath, url.pathname);
        log(`serving static file ${req.url} from ${filePath}`);
        const resolvedPath = path_1.default.resolve(filePath);
        const staticDir = path_1.default.resolve(this.staticPath);
        if (!resolvedPath.startsWith(staticDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return true;
        }
        try {
            const stats = fs_1.default.statSync(filePath);
            log(`${stats.isDirectory() ? 'directory' : 'file'} ${filePath}`);
            if (stats.isDirectory()) {
                const indexPath = path_1.default.join(filePath, 'index.html');
                if (fs_1.default.existsSync(indexPath)) {
                    res.setHeader('Content-Type', 'text/html');
                    res.writeHead(200);
                    fs_1.default.createReadStream(indexPath).pipe(res);
                    return true;
                }
                return false;
            }
            if (stats.isFile()) {
                const ext = path_1.default.extname(filePath).toLowerCase();
                const mimeTypes = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.txt': 'text/plain',
                    '.pdf': 'application/pdf',
                    '.xml': 'application/xml',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf',
                    '.eot': 'application/vnd.ms-fontobject'
                };
                const contentType = mimeTypes[ext] || 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                res.writeHead(200);
                fs_1.default.createReadStream(filePath).pipe(res);
                return true;
            }
        }
        catch (error) {
            return false;
        }
        return false;
    }
    async registerFolder(folder) {
        await this._registerFolder(folder, folder);
    }
    async _registerFolder(folder, originalFolder) {
        const files = await fs_1.default.promises.readdir(folder);
        await Promise.all(files.map(async (file) => {
            const filePath = path_1.default.join(folder, file);
            const stats = await fs_1.default.promises.stat(filePath);
            if (stats.isDirectory()) {
                await this._registerFolder(filePath, originalFolder);
            }
            else {
                const httpTrigger = (await Promise.resolve(`${filePath}`).then(s => __importStar(require(s))))?.triggers?.find((trigger) => trigger.type === 'http');
                if (!httpTrigger) {
                    return;
                }
                const relativeFilePath = path_1.default.relative(originalFolder, filePath);
                log(`Registering route ${httpTrigger.method || 'GET'} /api/${httpTrigger.path || relativeFilePath.split('.')[0]}`);
                this.routes[`${httpTrigger.method || 'GET'} /api/${httpTrigger.path || relativeFilePath.split('.')[0]}`] = relativeFilePath.split('.')[0];
            }
        }));
    }
    listen(port) {
        http_1.default.createServer(async (req, res) => {
            log(`${req.method} ${req.url}`);
            const corsHandled = this.handleCors(req, res);
            if (corsHandled) {
                return;
            }
            const staticServed = this.serveStaticFile(req, res);
            if (staticServed) {
                return;
            }
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const match = this.findMatchingRoute(req.method || 'GET', url.pathname);
            if (!match && req.method === 'GET') {
                req.url = '/index.html';
                this.serveStaticFile(req, res);
                return;
            }
            const { route, params } = match || { route: 'not-found', params: {} };
            const query = Object.fromEntries(url.searchParams);
            const result = await this.flows.execute(this.routes[route], { params, query, headers: req.headers }, { ...this.unsafe, req, res }).catch((err) => {
                log(err);
                return {
                    status: err.status || 500,
                    response: err.description || 'Internal server error',
                    redirect: undefined,
                    headers: undefined,
                    httpSent: false
                };
            });
            const { status, response, redirect, headers, httpSent } = result;
            if (httpSent) {
                return;
            }
            if (response?.type === 'Buffer') {
                res.end(Buffer.from(response.data));
                return;
            }
            if (redirect) {
                res.writeHead(302, { Location: redirect });
                res.end();
                return;
            }
            if (headers) {
                for (const [key, value] of Object.entries(headers)) {
                    res.setHeader(key, value);
                }
            }
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(status || 200);
            res.end(JSON.stringify(response));
        }).listen(port);
    }
}
exports.default = HttpTrigger;
function handleJson(data, unsafe) {
    return new Promise((resolve, reject) => {
        let body = '';
        unsafe.req.on('data', chunk => {
            body += chunk.toString();
        });
        unsafe.req.on('end', () => {
            try {
                resolve({
                    ...data,
                    body: body ? JSON.parse(body) : {}
                });
            }
            catch (error) {
                reject(error);
            }
        });
    });
}
function handleUrlEncodedExtended(data, unsafe) {
    return new Promise((resolve, reject) => {
        let body = '';
        unsafe.req.on('data', chunk => {
            body += chunk.toString();
        });
        unsafe.req.on('end', () => {
            try {
                resolve({
                    ...data,
                    body: body ? qs_1.default.parse(body) : {}
                });
            }
            catch (error) {
                reject(error);
            }
        });
    });
}
class HttpError extends Error {
    status;
    description;
    constructor(status, description) {
        super(description);
        this.status = status;
        this.description = description;
        if (!description) {
            this.description = http_1.default.STATUS_CODES[status];
        }
    }
}
exports.HttpError = HttpError;
//# sourceMappingURL=index.js.map