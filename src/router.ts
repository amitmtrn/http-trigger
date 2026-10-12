/**
 * Method + path → flow name. Patterns use `:param` segments. Routes are compiled once at
 * registration; an exact match wins over a pattern, and patterns are tried in registration order.
 */
export interface RouteMatch {
    flowName: string;
    params: Record<string, string>;
}

interface CompiledRoute {
    method: string;
    pattern: string;
    regex: RegExp;
    paramNames: string[];
    flowName: string;
}

export class Router {
    private exact = new Map<string, string>();
    private patterns: CompiledRoute[] = [];

    register(method: string, pattern: string, flowName: string): void {
        const m = method.toUpperCase();
        if (!pattern.includes(':')) {
            this.exact.set(`${m} ${pattern}`, flowName);
            return;
        }
        const paramNames = (pattern.match(/:[^/]+/g) || []).map((p) => p.slice(1));
        const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?:[^/]+/g, '([^/]+)');
        this.patterns.push({ method: m, pattern, regex: new RegExp(`^${source}$`), paramNames, flowName });
    }

    match(method: string, path: string): RouteMatch | null {
        const m = method.toUpperCase();
        const exact = this.exact.get(`${m} ${path}`);
        if (exact) return { flowName: exact, params: {} };
        for (const route of this.patterns) {
            if (route.method !== m) continue;
            const hit = path.match(route.regex);
            if (!hit) continue;
            const params: Record<string, string> = {};
            route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(hit[i + 1]); });
            return { flowName: route.flowName, params };
        }
        return null;
    }

    /** Every registered route, for logging and tests. */
    list(): Array<{ method: string; pattern: string; flowName: string }> {
        return [
            ...[...this.exact.entries()].map(([key, flowName]) => {
                const [method, pattern] = key.split(' ', 2);
                return { method, pattern, flowName };
            }),
            ...this.patterns.map(({ method, pattern, flowName }) => ({ method, pattern, flowName })),
        ];
    }
}
