// Local-only acceptance server for the real compiled Workers application.
// Requires build:vinext and the disposable customer fixture on 127.0.0.1:54330.
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
const root = resolve("dist/server"),
  entry = resolve(root, config.main);
const modules = (await readdir(root, { recursive: true }))
  .filter((path) => /\.m?js$/.test(path))
  .map((path) => resolve(root, path))
  .filter((path) => path !== entry);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    host: "127.0.0.1",
    port: 0,
    workers: [
      {
        name: "songgift-growth-isolated",
        modulesRoot: root,
        modules: [entry, ...modules].map((path) => ({
          type: "ESModule",
          path,
        })),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings: {
          ...config.vars,
          SUPABASE_URL: "http://127.0.0.1:54330",
          SUPABASE_PUBLISHABLE_KEY: "isolated-public-key",
          SUPABASE_SERVICE_ROLE_KEY: "isolated-service-role",
          LYRICS_PROVIDER: "mock",
          MUSIC_PROVIDER: "mock",
          SONG_PRICE_USD: "9.99",
          SONGGIFT_ANALYTICS_CAMPAIGNS: "approved",
          SONGGIFT_MAINTENANCE_ENABLED: "false",
        },
        assets: {
          directory: resolve("dist/client"),
          binding: "ASSETS",
          run_worker_first: false,
          routerConfig: { has_user_worker: true },
          assetConfig: { html_handling: "none", not_found_handling: "none" },
        },
      },
    ],
  }),
);
// Mirror wrangler.json: static chunks bypass the app; dynamic requests reach workerd directly.
const worker = await mf.getWorker("songgift-growth-isolated");
const { ASSETS: assets } = await mf.getBindings("songgift-growth-isolated");
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const target = req.url.startsWith("/_next/static/") ? assets : worker;
    const response = await target.fetch(
      "http://" + req.headers.host + req.url,
      {
        method: req.method,
        headers,
        redirect: "manual",
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      },
    );
    const output = Object.fromEntries(response.headers);
    delete output["set-cookie"];
    res.writeHead(response.status, {
      ...output,
      ...(response.headers.getSetCookie().length
        ? { "set-cookie": response.headers.getSetCookie() }
        : {}),
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Isolated bridge: " + error.message);
  }
});
await new Promise((resolve) => server.listen(3041, "127.0.0.1", resolve));
console.log("Isolated workerd server ready: http://127.0.0.1:3041/");
const close = () => {
  server.close();
  mf.dispose().finally(() => process.exit(0));
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
