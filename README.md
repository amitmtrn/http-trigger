# HTTP Trigger

A simple HTTP server for handling API routes with support for URL parameters, CORS, and static file serving.

## Features

- **URL Parameter Support**: Routes can include dynamic parameters using `:paramName` syntax
- **CORS Support**: Configurable CORS headers
- **Static File Serving**: Serve static files from a specified directory
- **Query Parameters**: Automatic parsing of query string parameters
- **JSON Body Parsing**: Built-in JSON request body parsing
- **URL-encoded Body Parsing**: Support for form data parsing

## URL Parameters

You can define routes with dynamic parameters using the `:paramName` syntax:

```typescript
// Example route file: users/[id].ts
export const triggers = [
  {
    type: 'http',
    method: 'GET',
    path: '/users/:id'
  }
];

export default async function(data: any, unsafe: any) {
  const { id } = data; // URL parameter is available in data
  return {
    status: 200,
    response: { userId: id, message: `User ${id} details` }
  };
}
```

### Parameter Examples

- `/users/:id` - matches `/users/123`, `/users/abc`, etc.
- `/posts/:postId/comments/:commentId` - matches `/posts/123/comments/456`
- `/api/products/:category/:productId` - matches `/api/products/electronics/laptop`

## Usage

```typescript
import HttpTrigger from './src/index';

const httpTrigger = new HttpTrigger(flows, unsafe, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}, './public');

await httpTrigger.registerFolder('./routes');
httpTrigger.listen(3000);
```

## Route Definition

Routes are defined in TypeScript files with the following structure:

```typescript
export const triggers = [
  {
    type: 'http',
    method: 'GET', // HTTP method (GET, POST, PUT, DELETE, etc.)
    path: '/api/users/:id' // Route path with optional parameters
  }
];

export default async function(data: any, unsafe: any) {
  // data contains:
  // - URL parameters (e.g., { id: '123' })
  // - Query parameters (e.g., { page: '1', limit: '10' })
  // - Request body (if parsed)
  
  // unsafe contains:
  // - req: http.IncomingMessage
  // - res: http.ServerResponse
  // - headers: request headers
  
  return {
    status: 200,
    response: { message: 'Success' },
    headers: { 'Custom-Header': 'value' }, // optional
    redirect: '/new-location', // optional
    httpSent: false // set to true if you manually send response
  };
}
```

## Body Parsing

Use the provided helper functions to parse request bodies:

```typescript
import { handleJson, handleUrlEncodedExtended } from './src/index';

export default async function(data: any, unsafe: any) {
  // Parse JSON body
  const jsonData = await handleJson(data, unsafe);
  
  // Parse URL-encoded form data
  const formData = await handleUrlEncodedExtended(data, unsafe);
  
  return {
    status: 200,
    response: { received: jsonData.body }
  };
}
``` 