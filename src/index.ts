import { serve } from "bun";
import index from "./index.html";
import { readParquet } from 'parquet-wasm/node';
import { resolve } from 'path';


const server = serve({
  routes: {


    "/public/umap_200k.parquet": async () => {
      const bytes = await Bun.file(resolve("public/umap_200k.parquet")).arrayBuffer();
      const table = readParquet(new Uint8Array(bytes));
      const arrowBytes = table.intoIPCStream(); // ← this gives you the raw IPC bytes
      return new Response(arrowBytes, {
        headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
      });
    },
    
    "/public/cluster_labels.json": async () => {
      const file = Bun.file(resolve("public/cluster_labels.json"));
      return new Response(file, {
        headers: { "Content-Type": "application/json" },
      });
    },


    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
