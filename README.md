# @codeinkit/http-trigger

Turns HTTP requests into [`@codeinkit/flows`](https://www.npmjs.com/package/@codeinkit/flows) executions.
A flow file opts in by exporting a trigger; the server maps the route to the flow, runs it with
the request, and writes the result back.

```ts
// src/flows/story/get_story.ts  → flow name "story/get_story"
export const triggers = [{ type: 'http', method: 'GET', path: 'stories/:id' }];
export default [getUser, loadStory, formatResponse];

async function loadStory(data: { params: { id: string }; query: Record<string, string>; headers: IncomingHttpHeaders }, unsafe: { models: any }) {
  const story = await unsafe.models.Story.findById(data.params.id);
  if (!story) throw new HttpError(404, 'Story not found');
  return { ...data, story };
}
function formatResponse(data: { story: unknown }) {
  return { status: 200, response: { story: data.story } };
}
```

```ts
import HttpTrigger from '@codeinkit/http-trigger';

const http = new HttpTrigger(flows, unsafe, {
  cors: { origin: ['https://app.example'], credentials: true },
  staticPath: path.join(__dirname, 'static'),      // SPA: unknown GET → index.html
  handlers: [healthProbe, wellKnownFiles],          // run before static files and routes
});
await http.registerFolder(path.join(__dirname, 'src/flows'));
http.listen(3000);
```

## What a flow receives and returns

| | |
|---|---|
| `data` | `{ params, query, headers }` — `params` from `:segments`, `query` from the query string |
| `unsafe` | `{ ...unsafe, req, res }` — a fresh copy per request; writing into it never leaks to other requests |
| return | `{ status?, response?, headers?, redirect?, httpSent? }` |

`response` is JSON-encoded. `{ type: 'Buffer', data }` (a serialised Buffer) is sent raw.
`redirect` sends a 302. `httpSent: true` means the flow wrote the response itself.

Throw `HttpError(status, description)` from any action to end the request with that status;
the body is the description string. Pass `{ response }` to send a JSON body instead:

```ts
throw new HttpError(401, 'Session expired', { response: { success: false, reason: 'expired' } });
```

Any other thrown error is a `500` with the body `"Internal server error"`.

## Options

| option | default | meaning |
|---|---|---|
| `cors` | allow `*` | `CorsOptions` or `false` for none. `origin` may be `'*'`, one origin, a list, or `true` (echo) |
| `securityHeaders` | strict | HSTS, nosniff, `X-Frame-Options: DENY`, referrer and permissions policies; `false` for none |
| `staticPath` | – | folder served for GET/HEAD outside the API prefix; unknown paths get its `index.html` |
| `apiPrefix` | `/api` | prefix every route is registered under |
| `handlers` | `[]` | `(req, res) => boolean \| Promise<boolean>`, tried in order before anything else; `true` = handled |
| `notFoundFlow` | `not-found` | flow executed for an unknown API route |

## Body parsing

Put one of these first in a flow that reads a body:

```ts
import { handleJson, handleUrlEncodedExtended } from '@codeinkit/http-trigger';
export default [handleJson, getUser, createStory];   // data.body is the parsed JSON
```

`handleJson` rejects malformed JSON with a 400. `readBody(req, maxBytes?)` is exported for
custom parsers.

## Registering routes

`registerFolder(folder)` walks the folder, imports every `.js`/`.ts` file, and registers each
`{ type: 'http' }` entry of its `triggers` export. The flow name is the file path relative to
the folder without its extension — the same name `flows.registerFolder` gives it. `path`
defaults to that name; `method` defaults to `GET`. Triggers of other types (for example the
`interval` and `queue` triggers of `@codeinkit/worker-trigger`) are ignored here.

`register(method, path, flowName)` adds a route by hand. `routes()` lists them.

## Upgrading from 1.x

The positional constructor `(flows, unsafe, cors, staticPath, securityHeaders)` still works
and is deprecated. What changed:

- `handlers` replaces patching the private `serveStaticFile`.
- `handleJson` throws `HttpError(400)` on malformed JSON instead of a bare parse error.
- `HttpError` can carry a JSON `response` and `headers`.
- Static files are read asynchronously, `HEAD` is honoured, and more media types are mapped.
- `close()` stops the server.
