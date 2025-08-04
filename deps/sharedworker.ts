// SharedWorker polyfill that falls back to regular Worker
// Based on @okikio/sharedworker concept but simplified
export class SharedWorker {
  public readonly port: MessagePort;
  private worker?: Worker;
  private channel?: MessageChannel;

  constructor(url: string | URL, options?: WorkerOptions) {
    // Try SharedWorker first
    if (typeof (globalThis as any).SharedWorker !== 'undefined') {
      try {
        const sharedWorker = new (globalThis as any).SharedWorker(url, options);
        this.port = sharedWorker.port;
        return;
      } catch (error) {
        console.warn('SharedWorker failed, falling back to Worker:', error);
      }
    }

    // Fallback to regular Worker
    this.worker = new Worker(url, options);
    
    // Create a message channel to simulate SharedWorker behavior
    this.channel = new MessageChannel();
    this.port = this.channel.port1;
    
    // Set up message forwarding
    this.port.addEventListener('message', (event) => {
      this.worker?.postMessage(event.data);
    });
    
    this.worker.addEventListener('message', (event) => {
      this.port.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
    
    this.worker.addEventListener('error', (event) => {
      this.port.dispatchEvent(new MessageEvent('messageerror', { data: event }));
    });
  }

  // Method to close the worker and port for cleanup
  close() {
    if (this.worker) {
      this.worker.terminate();
    }
    this.port.close();
    this.channel?.port2.close();
  }
}