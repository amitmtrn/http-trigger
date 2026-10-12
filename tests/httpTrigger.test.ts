import fs from 'fs';
import os from 'os';
import path from 'path';
import HttpTrigger, { HttpError, handleJson, handleUrlEncodedExtended } from '../src';
import { Router } from '../src/router';

type Exec = jest.Mock<any, any>;

async function start(execute: Exec, options = {}) {
    const trigger = new HttpTrigger({ execute }, { models: { Story: 'model' } }, options);
    trigger.register('GET', 'stories/:id', 'story/get');
    trigger.register('POST', 'stories', 'story/create');
    trigger.register('GET', 'health', 'health');
    const server = trigger.listen(0);
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address() as { port: number };
    return { trigger, base: `http://127.0.0.1:${port}`, stop: () => trigger.close() };
}

describe('Router', () => {
    it('matches exact routes before patterns, extracts params, respects the method', () => {
        const r = new Router();
        r.register('GET', '/api/stories/:id', 'story/get');
        r.register('GET', '/api/stories/featured', 'story/featured');
        r.register('POST', '/api/stories/:id/comments/:commentId', 'comment/create');
        expect(r.match('GET', '/api/stories/featured')).toEqual({ flowName: 'story/featured', params: {} });
        expect(r.match('GET', '/api/stories/abc%20d')).toEqual({ flowName: 'story/get', params: { id: 'abc d' } });
        expect(r.match('POST', '/api/stories/1/comments/2')).toEqual({ flowName: 'comment/create', params: { id: '1', commentId: '2' } });
        expect(r.match('DELETE', '/api/stories/1')).toBeNull();
        expect(r.match('GET', '/api/stories/1/extra')).toBeNull();
    });
});

describe('HttpTrigger', () => {
    let stop: () => Promise<void>;
    afterEach(async () => { await stop?.(); stop = undefined as any; });

    it('executes the matched flow with params, query, headers and a per-request context copy', async () => {
        const execute: Exec = jest.fn(async (_name, _input, unsafe: any) => { unsafe.account = 'leak'; return { response: { ok: true } }; });
        const s = await start(execute); stop = s.stop;
        const res = await fetch(`${s.base}/api/stories/42?page=2`, { headers: { 'x-test': 'yes' } });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        const [name, input, unsafe] = execute.mock.calls[0] as any;
        expect(name).toBe('story/get');
        expect(input.params).toEqual({ id: '42' });
        expect(input.query).toEqual({ page: '2' });
        expect(input.headers['x-test']).toBe('yes');
        expect(unsafe.models).toEqual({ Story: 'model' });
        // the boot context must not receive what a flow writes into its request context
        expect((s.trigger as any).unsafe.account).toBeUndefined();
    });

    it('maps HttpError to its status and description, and a plain throw to 500', async () => {
        const execute: Exec = jest.fn()
            .mockRejectedValueOnce(new HttpError(403, 'nope'))
            .mockRejectedValueOnce(new Error('boom'))
            .mockRejectedValueOnce(new HttpError(409, 'conflict', { response: { success: false, reason: 'dup' } }));
        const s = await start(execute); stop = s.stop;
        const a = await fetch(`${s.base}/api/stories/1`);
        expect(a.status).toBe(403); expect(await a.json()).toBe('nope');
        const b = await fetch(`${s.base}/api/stories/1`);
        expect(b.status).toBe(500); expect(await b.json()).toBe('Internal server error');
        const c = await fetch(`${s.base}/api/stories/1`);
        expect(c.status).toBe(409); expect(await c.json()).toEqual({ success: false, reason: 'dup' });
    });

    it('honours status, headers, redirect and Buffer responses', async () => {
        const execute: Exec = jest.fn()
            .mockResolvedValueOnce({ status: 201, response: { id: 1 }, headers: { 'X-Custom': 'v' } })
            .mockResolvedValueOnce({ redirect: '/elsewhere' })
            .mockResolvedValueOnce({ response: { type: 'Buffer', data: [104, 105] }, headers: { 'Content-Type': 'text/plain' } });
        const s = await start(execute); stop = s.stop;
        const a = await fetch(`${s.base}/api/stories`, { method: 'POST' });
        expect(a.status).toBe(201); expect(a.headers.get('x-custom')).toBe('v');
        const b = await fetch(`${s.base}/api/stories`, { method: 'POST', redirect: 'manual' });
        expect(b.status).toBe(302); expect(b.headers.get('location')).toBe('/elsewhere');
        const c = await fetch(`${s.base}/api/stories`, { method: 'POST' });
        expect(await c.text()).toBe('hi'); expect(c.headers.get('content-type')).toBe('text/plain');
    });

    it('runs the not-found flow for an unknown API route', async () => {
        const execute: Exec = jest.fn(async () => ({ status: 404, response: { result: 'Not Found' } }));
        const s = await start(execute); stop = s.stop;
        const res = await fetch(`${s.base}/api/nothing`);
        expect(res.status).toBe(404);
        expect(execute.mock.calls[0][0]).toBe('not-found');
    });

    it('answers CORS preflight with 204 and echoes a listed origin', async () => {
        const execute: Exec = jest.fn();
        const s = await start(execute, { cors: { origin: ['https://app.test'], credentials: true } }); stop = s.stop;
        const pre = await fetch(`${s.base}/api/stories`, { method: 'OPTIONS', headers: { origin: 'https://app.test' } });
        expect(pre.status).toBe(204);
        expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.test');
        expect(pre.headers.get('access-control-allow-credentials')).toBe('true');
        expect(pre.headers.get('x-frame-options')).toBe('DENY');
        expect(execute).not.toHaveBeenCalled();
        const other = await fetch(`${s.base}/api/stories`, { method: 'OPTIONS', headers: { origin: 'https://evil.test' } });
        expect(other.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('lets a custom handler answer before static files and routes', async () => {
        const execute: Exec = jest.fn();
        const s = await start(execute, {
            handlers: [(req: any, res: any) => { if (req.url === '/api/health') { res.writeHead(503); res.end('down'); return true; } return false; }],
        }); stop = s.stop;
        const res = await fetch(`${s.base}/api/health`);
        expect(res.status).toBe(503);
        expect(execute).not.toHaveBeenCalled();
    });

    it('serves static files, falls back to index.html for unknown pages, and blocks traversal', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-trigger-'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<h1>app</h1>');
        fs.mkdirSync(path.join(dir, 'assets'));
        fs.writeFileSync(path.join(dir, 'assets', 'a.js'), 'console.log(1)');
        const execute: Exec = jest.fn(async () => ({ status: 404, response: 'nf' }));
        const s = await start(execute, { staticPath: dir }); stop = s.stop;
        const js = await fetch(`${s.base}/assets/a.js`);
        expect(js.headers.get('content-type')).toBe('application/javascript');
        expect(await js.text()).toBe('console.log(1)');
        const spa = await fetch(`${s.base}/story/123/read`);
        expect(spa.status).toBe(200); expect(await spa.text()).toBe('<h1>app</h1>');
        const api = await fetch(`${s.base}/api/missing`);
        expect(api.status).toBe(404); // API paths never fall back to the SPA shell
        const traversal = await fetch(`${s.base}/..%2F..%2Fetc%2Fpasswd`);
        expect([403, 200]).toContain(traversal.status); // URL normalisation may already collapse it; never a file outside root
        expect(await traversal.text()).not.toContain('root:');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registerFolder maps http triggers to the file-relative flow name', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-trigger-flows-'));
        fs.mkdirSync(path.join(dir, 'story'));
        fs.writeFileSync(path.join(dir, 'story', 'get_story.js'), "exports.triggers = [{ type: 'http', method: 'GET', path: 'stories/:id' }]; exports.default = [];");
        fs.writeFileSync(path.join(dir, 'story', 'by_name.js'), "exports.triggers = [{ type: 'http' }]; exports.default = [];");
        fs.writeFileSync(path.join(dir, 'story', 'worker.js'), "exports.triggers = [{ type: 'interval', every: 1000 }]; exports.default = [];");
        const trigger = new HttpTrigger({ execute: jest.fn() }, {});
        await trigger.registerFolder(dir);
        expect(trigger.routes()).toEqual(expect.arrayContaining([
            { method: 'GET', pattern: '/api/stories/:id', flowName: 'story/get_story' },
            { method: 'GET', pattern: '/api/story/by_name', flowName: 'story/by_name' },
        ]));
        expect(trigger.routes()).toHaveLength(2);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('still accepts the 1.x positional constructor', async () => {
        const execute: Exec = jest.fn(async () => ({ response: 1 }));
        const trigger = new HttpTrigger({ execute }, {}, { origin: 'https://legacy.test' }, undefined, false);
        trigger.register('GET', 'x', 'x');
        const server = trigger.listen(0);
        await new Promise((r) => server.once('listening', r));
        const { port } = server.address() as { port: number };
        const res = await fetch(`http://127.0.0.1:${port}/api/x`);
        expect(res.headers.get('access-control-allow-origin')).toBe('https://legacy.test');
        expect(res.headers.get('x-frame-options')).toBeNull();
        await trigger.close();
    });
});

describe('body helpers', () => {
    const fakeReq = (body: string) => {
        const { Readable } = require('stream');
        return Readable.from([Buffer.from(body)]);
    };
    it('handleJson parses JSON and rejects malformed input with 400', async () => {
        expect(await handleJson({ a: 1 }, { req: fakeReq('{"x":2}') })).toEqual({ a: 1, body: { x: 2 } });
        expect(await handleJson({}, { req: fakeReq('') })).toEqual({ body: {} });
        await expect(handleJson({}, { req: fakeReq('{nope') })).rejects.toMatchObject({ status: 400 });
    });
    it('handleUrlEncodedExtended parses nested forms', async () => {
        expect(await handleUrlEncodedExtended({}, { req: fakeReq('a[b]=1&c=2') })).toEqual({ body: { a: { b: '1' }, c: '2' } });
    });
});
