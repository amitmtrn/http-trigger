import http from 'http';

/**
 * Throw from any action to end the request with a status. `description` becomes the response
 * body (a string, as before); set `response` to send a JSON body instead.
 */
export class HttpError extends Error {
    public status: number;
    public description: string;
    public response?: unknown;
    public headers?: Record<string, string>;

    constructor(status: number, description?: string, options?: { response?: unknown; headers?: Record<string, string> }) {
        super(description || http.STATUS_CODES[status] || 'Error');
        this.name = 'HttpError';
        this.status = status;
        this.description = description || http.STATUS_CODES[status] || 'Error';
        this.response = options?.response;
        this.headers = options?.headers;
    }
}
