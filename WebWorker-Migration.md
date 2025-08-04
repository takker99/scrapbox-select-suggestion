# WebWorker Migration Guide

This document describes the migration from `requestAnimationFrame` to WebWorker
for search functionality.

## Overview

The search functionality has been enhanced to support WebWorker-based processing
to prevent UI freezing during large dataset searches. The system gracefully
falls back to the original `requestAnimationFrame` approach when WebWorker is
not available or fails.

## Key Benefits

- **Non-blocking UI**: Search operations run in a separate thread
- **Better performance**: More efficient processing for large datasets
- **Graceful fallback**: Automatic fallback to original implementation
- **CSP compliant**: Uses bundled worker files instead of Blob URLs

## Usage

### Basic Setup with WebWorker

```typescript
import { setup } from "./mod.tsx";

// Bundle the worker first: deno task bundle-worker
const ops = await setup({
  workerUrl: "https://your-cdn.com/search.worker.bundle.js",
});
```

### Without WebWorker (Fallback)

```typescript
import { setup } from "./mod.tsx";

// No workerUrl specified - uses original requestAnimationFrame
const ops = await setup({
  // other options...
});
```

## Building the Worker

1. Bundle the worker file:
   ```bash
   deno task bundle-worker
   ```

2. Host the bundled `search.worker.bundle.js` file on a CDN or server

3. Pass the URL to the `setup` function

## Architecture

### Files Modified

- `search.worker.ts` - New WebWorker implementation
- `cancelableSearch.ts` - WebWorker integration with fallback
- `useSearch.ts` - Hook accepts workerUrl option
- `App.tsx` - Passes workerUrl through component tree
- `mod.tsx` - Exposes workerUrl in SetupInit interface

### Worker Communication

The worker uses a message-passing interface:

```typescript
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

Both WebWorker and fallback implementations support search cancellation:

- WebWorker: Sends cancel message to worker
- Fallback: Sets abort flag to stop iteration

## Performance Considerations

- **Chunk size**: Default 5000 items per chunk (configurable)
- **Progress reporting**: Real-time progress updates during search
- **Memory usage**: Worker processes data in chunks to manage memory
- **Fallback cost**: Negligible overhead when WebWorker fails

## CSP Compliance

The implementation avoids Blob URLs (which are often blocked by CSP) by:

1. Using external bundled worker files
2. Loading workers via standard `new Worker(url)` constructor
3. Requiring pre-bundled and hosted worker scripts

## Error Handling

- Worker creation failures trigger automatic fallback
- Worker errors are logged and fallback is used
- Invalid worker URLs gracefully fallback
- Network errors during worker loading are handled

## Migration Path

For existing users:

1. **No changes required**: Existing code continues to work unchanged
2. **Opt-in WebWorker**: Add `workerUrl` parameter to enable WebWorker
3. **Performance gains**: Immediate UI responsiveness improvement

## Development

### Running Tests

```bash
deno task check  # Includes new WebWorker tests
```

### Building

```bash
deno task bundle-worker  # Generate bundled worker
```

### Debugging

Enable debug logging:

```typescript
await setup({
  debug: true,
  workerUrl: "your-worker-url",
});
```
