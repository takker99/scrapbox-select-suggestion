declare global {
  interface TransformerCancelCallback {
    (reason: unknown): void | PromiseLike<void>;
  }
}
export {};
