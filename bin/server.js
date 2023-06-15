"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const generateSite_1 = require("./generateSite");
const http_1 = __importDefault(require("http"));
const bonjour_1 = __importDefault(require("bonjour"));
const ws_1 = require("ws");
/**
 * Starts mf-scripts server
 * @param {object} config
 * @param {string} host
 * @param {number} port
 */
function startServer(config, host, port) {
    const locals = {};
    let server;
    /**
     * HTTP server for html hosting and proxy routes
     * @param req
     * @param res
     */
    const requestListener = function (req, res) {
        // @ts-ignore
        const baseURL = req.protocol + '://' + req.headers.host + '/';
        const reqUrl = new URL(req.url ?? '/', baseURL);
        if (reqUrl.pathname == '/') {
            res.setHeader('Content-Type', 'text/html');
            res.writeHead(200);
            res.end((0, generateSite_1.generateHome)(config?.remotes ?? {}, server.address().port));
        }
        else if (reqUrl.pathname == '/locals') {
            if (req.method === 'POST') {
            }
            res.write('hello world');
            res.end();
        }
        else if (reqUrl.pathname === '/start') {
            res.write('hello world');
            res.end();
        }
    };
    server = http_1.default.createServer(requestListener);
    server.on('error', (e) => {
        console.error(e);
        if (e.code === 'EADDRINUSE') {
            console.error('Address in use, retrying...');
            setTimeout(() => {
                server.close();
                server.listen({ port: 0, host });
            }, 1000);
        }
    });
    server.on('listening', () => {
        const addr = server?.address();
        if (typeof addr === 'string') {
            console.log(`Server is running on ${addr}`);
            return;
        }
        console.log(`Server is running on http://${host}${addr?.port ? `:${addr.port}` : ''}`);
    });
    const wss = new ws_1.WebSocketServer({
        noServer: true,
    });
    const clients = [];
    wss.on('connection', (ws) => {
        clients.push(ws);
        ws.on('error', console.error);
        // TODO: add some logic to differentiate different clients maybe cookies? headers?
        ws.on('message', data => {
            console.log('received: %s', data);
        });
        const message = { fake: 8080 };
        for (const [key, value] of Object.entries(locals)) {
            message[key] = value.port;
        }
        ws.send(JSON.stringify(message));
        console.log('ws connected');
    });
    server.on('upgrade', (request, socket, head) => {
        console.log('upgrade req');
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
    const bonjour = (0, bonjour_1.default)();
    const browser = bonjour.find({ type: 'http', subtypes: ['webpack'] }, (data) => {
        locals[data.name] = data;
        const message = {};
        message[data.name] = data.port;
        console.log('found', data);
        for (const client of clients) {
            client.send(JSON.stringify(message));
        }
    });
    browser.start();
    server.listen({
        port,
        host,
    });
}
exports.default = startServer;
//# sourceMappingURL=server.js.map