import { Cache, HttpServer, Try } from "https://deno.land/x/deco@0.9.6/mod.ts";
import { EgoGraph } from "./egograph.ts";
import { Telegram } from "./telegram.ts";

const PORT = 8080;
const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

class WebUI {
  @HttpServer.Static({
    assets: [
      { fileName: "./webui/index.html", path: "/", contentType: "text/html" },
      { fileName: "./webui/favicon.ico", contentType: "image/x-icon" },
      { fileName: "./webui/script.js", contentType: "application/javascript" },
      { fileName: "./webui/style.css", contentType: "text/css" },
    ],
    path: "/",
  })
  @HttpServer.ResponseInit(() => ({
    init: {
      headers: {
        "cache-control": `public, max-age=${CACHE_EXPIRATION_MS / 1000}`,
      },
    },
  }))
  @Cache({ ttl: CACHE_EXPIRATION_MS })
  index() {}
}

class API {
  @HttpServer.Post("/")
  @HttpServer.ResponseInit(() => ({
    init: {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${CACHE_EXPIRATION_MS / 1000}`,
      },
    },
  }))
  @Cache({ ttl: CACHE_EXPIRATION_MS })
  async graph(
    { http, urlParams }: { http: Deno.RequestEvent; urlParams: string },
  ) {
    const params = new URLSearchParams(urlParams ?? "");
    const query = params.get("q");
    if (query) {
      this.sendNotification(
        `${http.request.headers.get("host") ?? "<unkown host>"} -> ${query}`,
      );
      const depth = Number(params.get("d"));
      const radius = Number(params.get("r"));
      const format = params.get("f");
      const ego = new EgoGraph({
        query,
        ...depth && { depth },
        ...radius && { radius },
        ...format && { format },
      });
      await ego.build();
      const body = JSON.stringify(ego.toObject());
      return { body };
    } else {
      return { init: { status: 400 } }; // bad request
    }
  }

  @Try({ log: true })
  sendNotification(text: string) {
    return Telegram.sendMessage(text);
  }
}

const shutdown = new AbortController();
Deno.addSignalListener("SIGINT", () => {
  shutdown.abort();
});

HttpServer.serve({
  abortSignal: shutdown.signal,
  controllers: [WebUI, API],
  port: PORT,
  hostname: "0.0.0.0",
  onStarted() {
    console.info(`HTTP server started at :${PORT}...`);
  },
  onError(e: unknown) {
    console.error(e);
  },
  onClosed() {
    console.info(`...server closed.`);
    Deno.exit();
  },
});
