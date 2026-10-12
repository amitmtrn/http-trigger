import type http from 'http';
export declare function contentTypeFor(filePath: string): string;
export declare function serveStatic(root: string, pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean>;
//# sourceMappingURL=static.d.ts.map