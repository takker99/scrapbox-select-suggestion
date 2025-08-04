# SharedWorker Migration Guide

This document describes the migration from WebWorker to SharedWorker
for search functionality using @okikio/sharedworker.

## Overview

The search functionality has been enhanced to use SharedWorker-based processing
to prevent UI freezing during large dataset searches and enable sharing of worker
instances across multiple tabs. The system uses @okikio/sharedworker which provides
automatic fallback to WebWorker on platforms where SharedWorker is not supported
(like Chrome for Android).

## Key Benefits

- **Shared across tabs**: Single worker instance serves multiple tabs
- **Memory efficient**: Reduces memory usage when multiple tabs are open
- **Non-blocking UI**: Search operations run in a separate thread
- **Better performance**: More efficient processing for large datasets
- **Cross-platform compatibility**: Uses @okikio/sharedworker for fallback support
- **CSP compliant**: Uses bundled worker files instead of Blob URLs

## Usage

### Basic Setup with SharedWorker

```ts ignore
import { setup } from "./mod.tsx";

// Bundle the worker first: deno task bundle-worker
const ops = await setup({
  workerUrl: "https://your-cdn.com/search.worker.bundle.js",
});
```

### Without SharedWorker (No Longer Supported)

This approach is no longer supported in the current version. SharedWorker is now
required for all search operations, with automatic fallback to WebWorker provided
by @okikio/sharedworker on unsupported platforms.

## Building the Worker

1. Bundle the worker file:
   ```bash
   deno task bundle-worker
   ```

2. Host the bundled `search.worker.bundle.js` file on a CDN or server

3. Pass the URL to the `setup` function

## Architecture

### Files Modified

- `search.worker.ts` - Modified for SharedWorker compatibility
- `cancelableSearch.ts` - Updated to use SharedWorker instead of WebWorker
- `deps/sharedworker.ts` - New dependency for @okikio/sharedworker
- `examples/webworker.ts` - Updated examples for SharedWorker usage
- `WebWorker-Migration.md` - Updated documentation

### Worker Communication

The worker uses a message-passing interface through SharedWorker ports:

```typescript
import type { Candidate, MatchInfo } from "./search.ts";

// Request format
interface SearchRequest {
  id: string;
  query: string;
  source: Candidate[];
  chunk: number;
}

// Response format
interface SearchProgress {
  id: string;
  candidates: (Candidate & MatchInfo)[];
  progress: number;
  completed: boolean;
}
```

### Cancellation Support

Both SharedWorker and WebWorker fallback implementations support search cancellation:

- SharedWorker: Sends cancel message to worker through port
- WebWorker fallback: Sends cancel message to worker (handled by @okikio/sharedworker)

## Performance Considerations

- **Chunk size**: Default 5000 items per chunk (configurable)
- **Progress reporting**: Real-time progress updates during search
- **Memory usage**: Worker processes data in chunks to manage memory
- **Cross-tab sharing**: Single worker instance serves multiple tabs
- **Automatic fallback**: @okikio/sharedworker handles platform compatibility

## CSP Compliance

The implementation avoids Blob URLs (which are often blocked by CSP) by:

1. Using external bundled worker files
2. Loading workers via standard `new Worker(url)` constructor
3. Requiring pre-bundled and hosted worker scripts

## Error Handling

- Worker creation failures are handled by @okikio/sharedworker fallback
- Worker errors are logged and handled gracefully
- Invalid worker URLs gracefully fallback to WebWorker
- Network errors during worker loading are handled
- Cross-browser compatibility ensured by @okikio/sharedworker

## Migration Path

For existing users:

1. **No changes required**: Existing code continues to work unchanged
2. **Opt-in SharedWorker**: Add `workerUrl` parameter to enable SharedWorker
3. **Performance gains**: Immediate UI responsiveness improvement + memory savings
4. **Cross-platform support**: Automatic fallback on unsupported platforms

## Development

### Running Tests

```bash
deno task check  # Includes new SharedWorker tests
```

### Building

```bash
deno task bundle-worker  # Generate bundled worker compatible with SharedWorker
```

### Debugging

Enable debug logging:

```ts ignore
import { setup } from "./mod.tsx";

await setup({
  debug: true,
  workerUrl: "https://cdn.example.com/search.worker.bundle.js",
});
```
