import { setup } from "../mod.tsx";

// workerUrl is now required - you need to bundle and host the worker file
// Run: deno task bundle-worker
// Then serve the bundled file and provide its URL
const WORKER_URL = "https://your-cdn.com/search.worker.bundle.js";

await setup({
  workerUrl: WORKER_URL,
});
