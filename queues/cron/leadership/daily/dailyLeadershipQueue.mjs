import { Queue } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";

export const dailyLeadershipQueue = new Queue("dailyLeadershipQueue", {
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

const repeatJobs = await dailyLeadershipQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processDailyLeadership");

if (!alreadyScheduled) {
    await dailyLeadershipQueue.add("processDailyLeadership", {}, {
    repeat: {
        cron: "0 0 * * *" // every day at midnight (00:00)
        // cron: "*/1 * * * *" // for testing
        },
        jobId: "processDailyLeadership"
    });
}

// await dailyLeadershipQueue.clean(1000 * 60 * 60 * 24, "completed");
// await dailyLeadershipQueue.clean(1000 * 60 * 60 * 24, "failed");
