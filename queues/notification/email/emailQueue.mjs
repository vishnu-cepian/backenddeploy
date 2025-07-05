import { Queue } from "bullmq";
import { bullRedis } from "../../../config/redis-config.mjs";

export const emailQueue = new Queue("emailQueue", {
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

await emailQueue.clean(1000 * 60 * 60 * 24, "completed");
await emailQueue.clean(1000 * 60 * 60 * 24, "failed");
