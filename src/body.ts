import type http from 'http';
import qs from 'qs';
import { HttpError } from './errors';

interface WithReq { req: http.IncomingMessage }

/** Read the whole request body as a string. Rejects with 413 past `maxBytes` (default: no limit). */
export function readBody(req: http.IncomingMessage, maxBytes = Infinity): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) { reject(new HttpError(413, 'Payload too large')); req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Flow action: adds `data.body` parsed as JSON (`{}` when the body is empty). */
export async function handleJson<T extends object>(data: T, unsafe: WithReq): Promise<T & { body: unknown }> {
    const raw = await readBody(unsafe.req);
    try {
        return { ...data, body: raw ? JSON.parse(raw) : {} };
    } catch {
        throw new HttpError(400, 'Invalid JSON body');
    }
}

/** Flow action: adds `data.body` parsed as an extended URL-encoded form (qs). */
export async function handleUrlEncodedExtended<T extends object>(data: T, unsafe: WithReq): Promise<T & { body: unknown }> {
    const raw = await readBody(unsafe.req);
    return { ...data, body: raw ? qs.parse(raw) : {} };
}
