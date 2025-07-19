import { Queue } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";

export const expirePendingVendorsQueue = new Queue("expirePendingVendorsQueue", {
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

const repeatJobs = await expirePendingVendorsQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processExpirePendingVendors");

if (!alreadyScheduled) {
    await expirePendingVendorsQueue.add("processExpirePendingVendors", {}, {
    repeat: {
        cron: "*/30 * * * *" // every 30 minutes
        // cron: "*/1 * * * *" // for testing
        },
        jobId: "processExpirePendingVendors"
    });
}

// await expirePendingVendorsQueue.clean(1000 * 60 * 60 * 24, "completed");
// await expirePendingVendorsQueue.clean(1000 * 60 * 60 * 24, "failed");
