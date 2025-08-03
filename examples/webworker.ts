import { setup, SetupInit } from "../mod.tsx";

// Example of using WebWorker for improved performance
export const launchWithWorker = async (workerUrl: string, init?: SetupInit) => {
  // Bundle the worker file first using: deno task bundle-worker
  // Then serve the bundled file and provide its URL
  
  const ops = await setup({
    ...init,
    workerUrl: workerUrl, // e.g., "https://your-cdn.com/search.worker.bundle.js"
  });

  return ops;
};

// Example for UserScript deployment
export const launchForUserScript = async () => {
  // In a UserScript environment, you would typically:
  // 1. Bundle the worker using deno task bundle-worker
  // 2. Host the bundled file somewhere accessible
  // 3. Pass the URL to the setup function
  
  const WORKER_URL = "https://cdn.jsdelivr.net/gh/your-username/your-repo@main/search.worker.bundle.js";
  
  const ops = await setup({
    workerUrl: WORKER_URL,
    debug: false, // Set to true for development
    limit: 10, // Show more suggestions for better performance demonstration
  });

  console.log("WebWorker-powered search enabled!");
  return ops;
};

// Fallback example without WebWorker
export const launchFallback = async () => {
  // If no workerUrl is provided, it will use the original requestAnimationFrame approach
  const ops = await setup({
    // No workerUrl specified - will use fallback
    debug: true,
  });

  console.log("Using fallback requestAnimationFrame search");
  return ops;
};