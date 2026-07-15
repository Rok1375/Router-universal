import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/execute") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const payload = JSON.parse(body) as { step?: { id?: string } };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "succeeded",
        summary: "Hello Agent completed the example request.",
        output: { receivedStep: payload.step?.id ?? "unknown" },
        evidence: ["example-http-response"],
        metrics: { requests: 1 },
        retryable: false,
      }),
    );
  });
});

server.listen(4320, "127.0.0.1", () =>
  console.log("Hello Agent listening on http://127.0.0.1:4320"),
);
