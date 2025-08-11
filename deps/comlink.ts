// Minimal Comlink-like implementation for simple worker communication
// This provides the core functionality we need without external dependencies

const RELEASE_PROXY = Symbol("comlink.release");

// Use a mapped type to maintain the original interface while adding the release symbol
export type Remote<T> = T & {
  [RELEASE_PROXY]: () => void;
};

export const releaseProxy = RELEASE_PROXY;

export function wrap<T>(port: MessagePort): Remote<T> {
  let messageId = 0;
  const pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  port.addEventListener("message", (event) => {
    const { id, type, result, error } = event.data;
    
    if (type === "return") {
      const request = pendingRequests.get(id);
      if (request) {
        pendingRequests.delete(id);
        request.resolve(result);
      }
    } else if (type === "error") {
      const request = pendingRequests.get(id);
      if (request) {
        pendingRequests.delete(id);
        request.reject(new Error(error));
      }
    }
  });

  port.start();

  const proxy = new Proxy({} as any, {
    get(target, prop) {
      if (prop === RELEASE_PROXY) {
        return () => {
          port.close();
        };
      }

      return (...args: any[]) => {
        const id = ++messageId;
        
        return new Promise((resolve, reject) => {
          pendingRequests.set(id, { resolve, reject });
          
          port.postMessage({
            type: "call",
            id,
            method: prop,
            args,
          });
        });
      };
    },
  });

  return proxy;
}

export function expose<T>(api: T, port?: MessagePort): void {
  const targetPort = port || (self as any);
  
  const handleMessage = async (event: MessageEvent) => {
    const { type, id, method, args } = event.data;
    
    if (type !== "call") return;

    try {
      const result = await (api as any)[method](...args);
      
      // Check if result is an async iterable
      if (result && typeof result[Symbol.asyncIterator] === "function") {
        // Handle async iterables by converting them to arrays
        const items = [];
        for await (const item of result) {
          items.push(item);
        }
        targetPort.postMessage({
          type: "return",
          id,
          result: items,
        });
      } else {
        targetPort.postMessage({
          type: "return",
          id,
          result,
        });
      }
    } catch (error) {
      targetPort.postMessage({
        type: "error",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (port) {
    port.addEventListener("message", handleMessage);
    port.start();
  } else {
    (self as any).addEventListener("message", handleMessage);
  }
}