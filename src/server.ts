import { generateHome } from './generateSite';
import { IncomingMessage, Server, ServerResponse } from 'http';
import http from 'http';
import bonjourConstructor, { RemoteService } from 'bonjour';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Starts mf-scripts server
 * @param {object} config
 * @param {string} host
 * @param {number} port
 */
export default function startServer(
  config: { [key: string]: any },
  host: string,
  port: number
) {
  const locals: { [key: string]: RemoteService } = {}; // local dev servers of known module names
  const preferrence: { [key: string]: 'local' | 'remote' } = {}; // user preference for local/remote
  const proxies = {}; // proxy servers for remotes
  let server: Server;

  /**
   * HTTP server for html hosting and proxy routes
   * @param req
   * @param res
   */
  const requestListener = function (req: IncomingMessage, res: ServerResponse) {
    // @ts-ignore
    const baseURL = req.protocol + '://' + req.headers.host + '/';
    const reqUrl = new URL(req.url ?? '/', baseURL);

    if (reqUrl.pathname == '/') {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(
        generateHome(config?.remotes ?? {}, server?.address()?.port ?? 8080)
      );
    } else {
      const request = reqUrl.pathname.split('/');
      const module = request[1];
      const path = request.slice(2).join('/');
      let url;
      if (locals[module] && preferrence[module] === 'local' && locals[module]) {
        // proxy to local dev server
        const local = locals[module];
        url = `http://localhost:${local.port}/${path}`;
      } else {
        // proxy to remote dev server
        url = `https://${config?.remotes?.[module]?.remoteUrl}/${path}`;
      }

      fetch(url)
        .then(response => {
          console.log(response);
          const body = response.body;
          if (!body) {
            res.writeHead(response.status);
            res.end();
            return;
          }
          response.text().then(text => {
            console.log(text);
            res.writeHead(response.status);
            res.end(text);
          });
        })
        .catch(err => {
          console.log('fetch error: ', err);
          res.writeHead(500);
          res.end();
        });
    }
  };

  server = http.createServer(requestListener);

  server.on('error', (e: Error & { code: string }) => {
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
    console.log(
      `Server is running on http://${host}${addr?.port ? `:${addr.port}` : ''}`
    );
  });

  const wss = new WebSocketServer({
    noServer: true,
  });

  const clients: WebSocket[] = [];
  wss.on('connection', (ws: WebSocket) => {
    clients.push(ws);
    ws.on('error', console.error);
    ws.on('message', data => {
      console.log('received: %s', data);
    });
    const message: { [key: string]: number } = { fake: 8080 };
    for (const [key, value] of Object.entries(locals)) {
      message[key] = value.port;
    }
    ws.send(JSON.stringify(message));
    console.log('ws connected');
  });

  server.on('upgrade', (request: IncomingMessage, socket: any, head: any) => {
    console.log('upgrade req');
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      wss.emit('connection', ws, request);
    });
  });

  const bonjour = bonjourConstructor();
  const browser = bonjour.find(
    { type: 'http', subtypes: ['webpack'] },
    (data: RemoteService) => {
      locals[data.name] = data;
      const message: { [key: string]: number } = {};
      message[data.name] = data.port;
      console.log('found', data);
      for (const client of clients) {
        client.send(JSON.stringify(message));
      }
    }
  );
  browser.start();

  server.listen({
    port,
    host,
  });
}
