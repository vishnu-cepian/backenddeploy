import { Queue } from "bullmq";
import { bullRedis } from "../../config/redis-config.mjs";

export const outboxQueue = new Queue("outboxQueue", {
    connection: bullRedis,
    streams: {
        events: {
            maxLen: 100,
        }
    },
    defaultJobOptions: {
        attempts: 3,        // 3 attempts to process the job if it fails
        backoff: {
            type: "exponential",
            delay: 3000
        }
    }
});

// Add repeatable job (only once)
const repeatJobs = await outboxQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processOutbox");

if (!alreadyScheduled) {
  await outboxQueue.add(
    "processOutbox",
    {},
    {
      repeat: { every: 30000 }, // every 30s
    }
  );
}

await outboxQueue.clean(1000 * 60 * 60 * 24, "completed");
await outboxQueue.clean(1000 * 60 * 60 * 24, "failed");
