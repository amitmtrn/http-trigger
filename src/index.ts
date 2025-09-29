import fs from 'fs';
import path from 'path';
import http from 'http';
import qs from 'qs';
import debug from 'debug';

const log = debug('http-trigger');

type Flows = any;

interface HttpError {
    status?: number;
    description?: string;
}

interface CorsOptions {
    origin?: string | string[] | boolean;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}

interface RouteMatch {
    route: string;
    params: { [key: string]: string };
}

class HttpTrigger {

    private flows: Flows;
    private routes: { [key: string]: string } = {};
    private corsOptions: CorsOptions;
    private staticPath?: string;
    private unsafe: any;
    
    constructor(flows: Flows, unsafe: any, corsOptions?: CorsOptions, staticPath?: string) {
        this.flows = flows;
        this.unsafe = unsafe;
        this.staticPath = staticPath;
        this.corsOptions = {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            credentials: false,
            maxAge: 86400, // 24 hours
            ...corsOptions
        };
    }

    private parseRoutePattern(pattern: string): RegExp {
        // Convert route pattern like "/api/users/:id/posts/:postId" to regex
        const regexPattern = pattern
            .replace(/:[^/]+/g, '([^/]+)') // Replace :param with capture group
            .replace(/\//g, '\\/'); // Escape forward slashes
        return new RegExp(`^${regexPattern}$`);
    }

    private extractParams(pattern: string, path: string): { [key: string]: string } {
        const params: { [key: string]: string } = {};
        const paramNames = (pattern.match(/:[^/]+/g) || []).map(p => p.slice(1)); // Remove : prefix
        const regex = this.parseRoutePattern(pattern);
        const matches = path.match(regex);
        
        if (matches) {
            paramNames.forEach((name, index) => {
                params[name] = matches[index + 1]; // +1 because first match is the full string
            });
        }
        
        return params;
    }

    private findMatchingRoute(method: string, path: string): RouteMatch | null {
        const routeKey = `${method} ${path}`;
        
        // First try exact match
        if (this.routes[routeKey]) {
            return { route: routeKey, params: {} };
        }
        
        // Then try pattern matching for routes with parameters
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

    private handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        const origin = req.headers.origin;
        
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            this.setCorsHeaders(res, origin);
            res.writeHead(204);
            res.end();
            return true;
        }
        
        // Set CORS headers for actual requests
        this.setCorsHeaders(res, origin);
        return false;
    }

    private setCorsHeaders(res: http.ServerResponse, origin?: string) {
        // Handle origin
        if (this.corsOptions.origin === true) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
        } else if (this.corsOptions.origin === false) {
            // Don't set origin header
        } else if (Array.isArray(this.corsOptions.origin)) {
            if (origin && this.corsOptions.origin.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
        } else {
            res.setHeader('Access-Control-Allow-Origin', this.corsOptions.origin || '*');
        }

        // Set other CORS headers
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

    private serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        if (!this.staticPath || req.method !== 'GET') {
            return false;
        }

        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const filePath = path.join(this.staticPath, url.pathname);
        
        log(`serving static file ${req.url} from ${filePath}`);

        // Security check: prevent directory traversal
        const resolvedPath = path.resolve(filePath);
        const staticDir = path.resolve(this.staticPath);
        
        if (!resolvedPath.startsWith(staticDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return true;
        }

        try {
            const stats = fs.statSync(filePath);
            log(`${stats.isDirectory() ? 'directory' : 'file'} ${filePath}`);
            
            if (stats.isDirectory()) {
                // Try to serve index.html from directory
                const indexPath = path.join(filePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    res.setHeader('Content-Type', 'text/html');
                    res.writeHead(200);
                    fs.createReadStream(indexPath).pipe(res);
                    return true;
                }
                return false;
            }

            if (stats.isFile()) {
                const ext = path.extname(filePath).toLowerCase();
                
                // Set appropriate Content-Type based on file extension
                const mimeTypes: { [key: string]: string } = {
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
                fs.createReadStream(filePath).pipe(res);
                return true;
            }
        } catch (error) {
            // File doesn't exist or other error
            return false;
        }

        return false;
    }

    async registerFolder(folder:string) {
        await this._registerFolder(folder, folder);
    }
    private async _registerFolder(folder: string, originalFolder: string) {
        const files = await fs.promises.readdir(folder);

        await Promise.all(files.map(async file => {
          const filePath = path.join(folder, file);
          const stats = await fs.promises.stat(filePath);
    
          if(stats.isDirectory()) {
            await this._registerFolder(filePath, originalFolder);
          } else {
            const httpTrigger = (await import(filePath))?.triggers?.find((trigger: any) => trigger.type === 'http');
            if (!httpTrigger) {
                return;
            }
            const relativeFilePath = path.relative(originalFolder, filePath);
            log(`Registering route ${httpTrigger.method || 'GET'} /api/${httpTrigger.path || relativeFilePath.split('.')[0]}`);
            this.routes[`${httpTrigger.method || 'GET'} /api/${httpTrigger.path || relativeFilePath.split('.')[0]}`] = relativeFilePath.split('.')[0];
          }
        }));
    }

    listen(port: number) {
        http.createServer(async (req, res) => {
            log(`${req.method} ${req.url}`);
            const corsHandled = this.handleCors(req, res);
            if (corsHandled) {
                return;
            }

            // Try to serve static files first
            const staticServed = this.serveStaticFile(req, res);
            if (staticServed) {
                return;
            }

            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const match = this.findMatchingRoute(req.method || 'GET', url.pathname);

            if (!match) {
                req.url = '/index.html';
                this.serveStaticFile(req, res);
                return;
            }

            const { route, params } = match;

            const query = Object.fromEntries(url.searchParams);

            const result = await this.flows.execute(this.routes[route] || 'not-found', { params, query, headers: req.headers }, {...this.unsafe, req, res}).catch((err: HttpError) => {
                log(err);
                return {
                    status: err.status || 500,
                    response: err.description || 'Internal server error',
                    redirect: undefined,
                    headers: undefined,
                    httpSent: false
                }
            });
            
            
            const { status, response, redirect, headers, httpSent } = result as any;
            
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
                    res.setHeader(key, value as string);
                }
            }
    
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(status || 200);
            res.end(JSON.stringify(response));
        }).listen(port);
    }
}

export default HttpTrigger;

export function handleJson(data: {}, unsafe: {req: http.IncomingMessage, res: http.ServerResponse}) {
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
            } catch (error) {
                reject(error);
            }
        });
    });
}

export function handleUrlEncodedExtended(data: {}, unsafe: {req: http.IncomingMessage, res: http.ServerResponse}) {
    return new Promise((resolve, reject) => {
        let body = '';
        unsafe.req.on('data', chunk => {
            body += chunk.toString();
        });
        unsafe.req.on('end', () => {
            try {
                resolve({
                    ...data,
                    body: body ? qs.parse(body) : {}
                });
            } catch (error) {
                reject(error);
            }
        });
    });
}