"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBody = readBody;
exports.handleJson = handleJson;
exports.handleUrlEncodedExtended = handleUrlEncodedExtended;
const qs_1 = __importDefault(require("qs"));
const errors_1 = require("./errors");
function readBody(req, maxBytes = Infinity) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new errors_1.HttpError(413, 'Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
async function handleJson(data, unsafe) {
    const raw = await readBody(unsafe.req);
    try {
        return { ...data, body: raw ? JSON.parse(raw) : {} };
    }
    catch {
        throw new errors_1.HttpError(400, 'Invalid JSON body');
    }
}
async function handleUrlEncodedExtended(data, unsafe) {
    const raw = await readBody(unsafe.req);
    return { ...data, body: raw ? qs_1.default.parse(raw) : {} };
}
//# sourceMappingURL=body.js.map