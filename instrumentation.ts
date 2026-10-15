export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.DISABLE_QUEUE_WORKER === "true") return;
  const { startWorker } = await import("./lib/queue/worker");
  await startWorker();
}
