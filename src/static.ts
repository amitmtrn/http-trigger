import fs from 'fs';
import path from 'path';
import type http from 'http';

const MIME: Record<string, string> = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.pdf': 'application/pdf', '.wasm': 'application/wasm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
};

export function contentTypeFor(filePath: string): string {
    return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Serve `pathname` from `root`. Returns true when a response was sent (file, directory index,
 * or 403 on a traversal attempt) and false when there is nothing to serve at that path.
 */
export async function serveStatic(root: string, pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const rootDir = path.resolve(root);
    const target = path.resolve(rootDir, '.' + decodeURIComponent(pathname));
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
    }
    let filePath = target;
    let stats: fs.Stats;
    try {
        stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            stats = await fs.promises.stat(filePath);
        }
    } catch {
        return false;
    }
    if (!stats.isFile()) return false;

    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.setHeader('Content-Length', String(stats.size));
    res.writeHead(200);
    if (req.method === 'HEAD') { res.end(); return true; }
    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath).on('error', reject).on('end', resolve).pipe(res);
    }).catch(() => res.end());
    return true;
}
