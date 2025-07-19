import { Queue } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";

export const expireAcceptedQuotesQueue = new Queue("expireAcceptedQuotesQueue", {
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

const repeatJobs = await expireAcceptedQuotesQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processExpireAcceptedQuotes");

if (!alreadyScheduled) {
    await expireAcceptedQuotesQueue.add("processExpireAcceptedQuotes", {}, {
    repeat: {
        cron: "*/30 * * * *" // every 30 minutes
        // cron: "*/1 * * * *" // for testing
        },
        jobId: "processExpireAcceptedQuotes"
    });
}

// await expireAcceptedQuotesQueue.clean(1000 * 60 * 60 * 24, "completed");
// await expireAcceptedQuotesQueue.clean(1000 * 60 * 60 * 24, "failed");
