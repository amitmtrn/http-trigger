"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
const http_1 = __importDefault(require("http"));
class HttpError extends Error {
    status;
    description;
    response;
    headers;
    constructor(status, description, options) {
        super(description || http_1.default.STATUS_CODES[status] || 'Error');
        this.name = 'HttpError';
        this.status = status;
        this.description = description || http_1.default.STATUS_CODES[status] || 'Error';
        this.response = options?.response;
        this.headers = options?.headers;
    }
}
exports.HttpError = HttpError;
//# sourceMappingURL=errors.js.map