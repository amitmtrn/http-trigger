"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SECURITY_HEADERS = exports.DEFAULT_CORS = void 0;
exports.applyCors = applyCors;
exports.applySecurityHeaders = applySecurityHeaders;
exports.DEFAULT_CORS = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
    maxAge: 86400,
};
exports.DEFAULT_SECURITY_HEADERS = {
    hsts: 'max-age=63072000; includeSubDomains; preload',
    contentTypeOptions: true,
    frameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
    contentSecurityPolicy: false,
};
function applyCors(res, cors, requestOrigin) {
    const { origin } = cors;
    if (origin === true)
        res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
    else if (Array.isArray(origin)) {
        if (requestOrigin && origin.includes(requestOrigin))
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    else if (origin !== false)
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    if (cors.methods.length)
        res.setHeader('Access-Control-Allow-Methods', cors.methods.join(', '));
    if (cors.allowedHeaders.length)
        res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
    if (cors.credentials)
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (cors.maxAge)
        res.setHeader('Access-Control-Max-Age', String(cors.maxAge));
}
function applySecurityHeaders(res, h) {
    if (h.hsts)
        res.setHeader('Strict-Transport-Security', h.hsts);
    if (h.contentTypeOptions)
        res.setHeader('X-Content-Type-Options', 'nosniff');
    if (h.frameOptions)
        res.setHeader('X-Frame-Options', h.frameOptions);
    if (h.referrerPolicy)
        res.setHeader('Referrer-Policy', h.referrerPolicy);
    if (h.permissionsPolicy)
        res.setHeader('Permissions-Policy', h.permissionsPolicy);
    if (h.contentSecurityPolicy)
        res.setHeader('Content-Security-Policy', h.contentSecurityPolicy);
}
//# sourceMappingURL=headers.js.map