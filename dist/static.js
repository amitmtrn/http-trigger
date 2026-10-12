"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentTypeFor = contentTypeFor;
exports.serveStatic = serveStatic;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.pdf': 'application/pdf', '.wasm': 'application/wasm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
};
function contentTypeFor(filePath) {
    return MIME[path_1.default.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
async function serveStatic(root, pathname, req, res) {
    const rootDir = path_1.default.resolve(root);
    const target = path_1.default.resolve(rootDir, '.' + decodeURIComponent(pathname));
    if (target !== rootDir && !target.startsWith(rootDir + path_1.default.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
    }
    let filePath = target;
    let stats;
    try {
        stats = await fs_1.default.promises.stat(filePath);
        if (stats.isDirectory()) {
            filePath = path_1.default.join(filePath, 'index.html');
            stats = await fs_1.default.promises.stat(filePath);
        }
    }
    catch {
        return false;
    }
    if (!stats.isFile())
        return false;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.setHeader('Content-Length', String(stats.size));
    res.writeHead(200);
    if (req.method === 'HEAD') {
        res.end();
        return true;
    }
    await new Promise((resolve, reject) => {
        fs_1.default.createReadStream(filePath).on('error', reject).on('end', resolve).pipe(res);
    }).catch(() => res.end());
    return true;
}
//# sourceMappingURL=static.js.map