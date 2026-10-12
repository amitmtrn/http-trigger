export interface RouteMatch {
    flowName: string;
    params: Record<string, string>;
}
export declare class Router {
    private exact;
    private patterns;
    register(method: string, pattern: string, flowName: string): void;
    match(method: string, path: string): RouteMatch | null;
    list(): Array<{
        method: string;
        pattern: string;
        flowName: string;
    }>;
}
//# sourceMappingURL=router.d.ts.map