export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (
    process.env.NETLIFY === "true" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.DISABLE_QUEUE_WORKER === "true"
  ) {
    return;
  }
  try {
    const { startWorker } = await import("./lib/queue/worker");
    await startWorker();
  } catch (err) {
    console.error("[instrumentation] Failed to start queue worker:", err);
  }
}

