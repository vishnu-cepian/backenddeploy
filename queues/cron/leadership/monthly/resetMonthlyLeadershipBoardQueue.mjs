import { Queue } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";

export const resetMonthlyLeadershipBoardQueue = new Queue("resetMonthlyLeadershipBoardQueue", {
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

const repeatJobs = await resetMonthlyLeadershipBoardQueue.getRepeatableJobs();
const alreadyScheduled = repeatJobs.some(job => job.name === "processResetMonthlyLeadershipBoard");

if (!alreadyScheduled) {
    await resetMonthlyLeadershipBoardQueue.add("processResetMonthlyLeadershipBoard", {}, {
    repeat: {
        cron: "0 0 1 * *" // on the first day of every month at midnight (00:00)
        // cron: "*/1 * * * *" // for testing
        },
        jobId: "processResetMonthlyLeadershipBoard"
    });
}

// await resetMonthlyLeadershipBoardQueue.clean(1000 * 60 * 60 * 24, "completed");
// await resetMonthlyLeadershipBoardQueue.clean(1000 * 60 * 60 * 24, "failed");
