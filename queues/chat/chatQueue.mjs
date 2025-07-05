import { Queue } from "bullmq";
import { bullRedis } from "../../config/redis-config.mjs";

export const chatQueue = new Queue("chatQueue", {
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

await chatQueue.clean(1000 * 60 * 60 * 24, "completed");
await chatQueue.clean(1000 * 60 * 60 * 24, "failed");
