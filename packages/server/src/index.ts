/**
 * Civil Sarabande Game Server
 * Entry point for the game server
 */

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("Civil Sarabande server starting...");

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: Date.now() });
    }

    // API info
    if (url.pathname === "/") {
      return Response.json({
        name: "Civil Sarabande API",
        version: "0.0.1",
        endpoints: {
          health: "/health",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

