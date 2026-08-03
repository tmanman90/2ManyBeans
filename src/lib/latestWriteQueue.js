export function createLatestWriteQueue() {
  let tail = Promise.resolve();
  return {
    enqueue({ isCurrent, write }) {
      const queued = tail
        .catch(() => undefined)
        .then(async () => {
          if (!isCurrent()) return { skipped: true };
          await write();
          return { skipped: false };
        });
      tail = queued;
      return queued;
    },
  };
}

export function createKeyedLatestWriteQueue() {
  const queues = new Map();

  return {
    enqueue(key, { write }) {
      let queue = queues.get(key);
      if (!queue) {
        queue = createLatestWriteQueue();
        queues.set(key, queue);
      }
      return queue.enqueue({
        // Per-bean payloads are partial field updates. Preserve every queued
        // payload in order so a later V60 write cannot erase a pending Kalita
        // write (and vice versa). Same-device replacements still finish newest.
        isCurrent: () => true,
        write,
      });
    },
  };
}
