import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { InfraiError, infraiFromEnvironment } from "./infrai_client.js";
import { drillRequestSchema, runLeakedKeyDrill } from "./leaked_key_drill.js";

const port = Number(process.env.PORT ?? "3000");

function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/drills/leaked-key") {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "route not found" }));
    return;
  }

  try {
    const input = drillRequestSchema.parse(await readJson(request));
    const result = await runLeakedKeyDrill(input, infraiFromEnvironment(), randomUUID());
    response.statusCode = 200;
    response.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: "invalid request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      response.statusCode = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.end(JSON.stringify({ error: error.code, details: error.details }));
      return;
    }
    response.statusCode = 502;
    response.end(JSON.stringify({ error: "drill could not be completed" }));
  }
});

server.listen(port, () => {
  console.log(`Field-service drill listening on http://localhost:${port}`);
});
