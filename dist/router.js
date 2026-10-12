"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
class Router {
    exact = new Map();
    patterns = [];
    register(method, pattern, flowName) {
        const m = method.toUpperCase();
        if (!pattern.includes(':')) {
            this.exact.set(`${m} ${pattern}`, flowName);
            return;
        }
        const paramNames = (pattern.match(/:[^/]+/g) || []).map((p) => p.slice(1));
        const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?:[^/]+/g, '([^/]+)');
        this.patterns.push({ method: m, pattern, regex: new RegExp(`^${source}$`), paramNames, flowName });
    }
    match(method, path) {
        const m = method.toUpperCase();
        const exact = this.exact.get(`${m} ${path}`);
        if (exact)
            return { flowName: exact, params: {} };
        for (const route of this.patterns) {
            if (route.method !== m)
                continue;
            const hit = path.match(route.regex);
            if (!hit)
                continue;
            const params = {};
            route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(hit[i + 1]); });
            return { flowName: route.flowName, params };
        }
        return null;
    }
    list() {
        return [
            ...[...this.exact.entries()].map(([key, flowName]) => {
                const [method, pattern] = key.split(' ', 2);
                return { method, pattern, flowName };
            }),
            ...this.patterns.map(({ method, pattern, flowName }) => ({ method, pattern, flowName })),
        ];
    }
}
exports.Router = Router;
//# sourceMappingURL=router.js.map