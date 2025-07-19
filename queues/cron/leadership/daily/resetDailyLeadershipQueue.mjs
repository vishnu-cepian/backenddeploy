import { Queue } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";

export const resetDailyLeadershipQueue = new Queue("resetDailyLeadershipQueue", {
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

const repeatJobs = await resetDailyLeadershipQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processResetDailyLeadership");

if (!alreadyScheduled) {
    await resetDailyLeadershipQueue.add("processResetDailyLeadership", {}, {
    repeat: {
        cron: "0 0 * * *" // every day at midnight (00:00)
        // cron: "*/1 * * * *" // for testing
        },
        jobId: "processResetDailyLeadership"
    });
}

// await resetDailyLeadershipQueue.clean(1000 * 60 * 60 * 24, "completed");
// await resetDailyLeadershipQueue.clean(1000 * 60 * 60 * 24, "failed");
