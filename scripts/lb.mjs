// Dev tool: tiny round-robin reverse proxy to simulate several app instances behind a load balancer.
// Usage: node scripts/lb.mjs 3200 3201 3202 3203 3204   (first = listen port, rest = upstream ports)
import http from "node:http";
const [listen, ...ups] = process.argv.slice(2).map(Number);
let i = 0;
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
http.createServer((req, res) => {
  const port = ups[i++ % ups.length];
  const p = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers, agent }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on("error", () => { res.statusCode = 502; res.end("bad gateway"); });
  req.pipe(p);
}).listen(listen, () => console.log(`lb :${listen} -> ${ups.join(", ")}`));
