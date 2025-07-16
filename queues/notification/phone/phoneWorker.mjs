import { Worker } from "bullmq";
import { bullRedis } from "../../../config/redis-config.mjs";
// import { sendEmail } from "../../../services/notificationService.mjs";
import { AppDataSource } from "../../../config/data-source.mjs";
import { QueueLogs } from "../../../entities/queueLogs.mjs";
import { logger } from "../../../utils/logger-utils.mjs";

let phoneWorker;

export function initPhoneWorker() {
    phoneWorker = new Worker("phoneQueue", async (job) => {

        // const { email, name, template_id, variables } = job.data;
        // if (!email || !name || !template_id || !variables) {
        //     throw new Error("Invalid data in job");
        // }

        try {
            console.log("Sending phone notification to", job.data);
            // await sendEmail(email, name, template_id, variables);
        } catch (error) {
            // logger.error(`Failed to send email to ${email}: ${error.message}`, {
            //     error,
            //     jobId: job.id,
            //     email
            // });
            throw error;
        }
        },
        {
            connection: bullRedis,
            concurrency: 5,
            removeOnComplete: {
                age: 30,
                count: 10
            },
            removeOnFail: {
                age: 30,
                count: 10
            }
        }
    );

    phoneWorker.on("error", (error) => {
        logger.error("Error in phone worker:", error);
    });

    phoneWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    phoneWorker.on("failed", (job, error) => {
        logger.error(`Job ${job.id} failed: ${error.message}`);
        if(job.attemptsMade >= job.opts.attempts) {
            (async () => {
                const queueLogsRepo = AppDataSource.getRepository(QueueLogs);
                await queueLogsRepo.save({
                    queueName: job.queueName,
                    jobId: job.id,
                    jobData: job.data,
                    reason: error.message,
                    failedAt: new Date()
                });
            })();
        }
    });

    phoneWorker.on('drained', () => {
        logger.info('All jobs in phoneQueue have been processed.');
    });
      
    return phoneWorker;
}