/**
 * 
 * 
 * 
 * 
 * 
 * 
 * IMPORTANT! Default Eviction policy is volatile-lru. It should be "noeviction"
 * 
 * 
 * 
 * 
 * 
 * 
 */

/**
 * 
 * Start a seperate instance for worker.mjs after starting server.mjs
 * on cli do nodemon .\worker.mjs or node .\worker.mjs
 * 
 */

/**
 * 
 * Since we are using the same database for the worker and the server, we need to initialize the database here.
 * 
 */
import { AppDataSource } from "./config/data-source.mjs";
import { initChatWorker } from "./queues/chat/chatWorker.mjs";
import { initPushWorker } from "./queues/notification/push/pushWorker.mjs";
import { initEmailWorker } from "./queues/notification/email/emailWorker.mjs";
import { initPhoneWorker } from "./queues/notification/phone/phoneWorker.mjs";
import { initOutboxWorker } from "./queues/outbox/outboxWorker.mjs";
import { initDailyLeadershipWorker } from "./queues/cron/leadership/daily/dailyLeadershipWorker.mjs";
import { initResetMonthlyLeadershipBoardWorker } from "./queues/cron/leadership/monthly/resetMonthlyLeadershipBoardWorker.mjs";
import { initExpireAcceptedQuotesWorker } from "./queues/cron/expiringJobs/acceptedQuotes/expireAcceptedQuotesWorker.mjs";

let chatWorker;
let pushWorker;
let emailWorker;
let phoneWorker;
let outboxWorker;
let dailyLeadershipWorker;
let resetMonthlyLeadershipBoardWorker;
let expireAcceptedQuotesWorker;
let isShuttingDown = false;

async function startWorker() {
    try {
        await AppDataSource.initialize();
        console.log("Database initialized");

        chatWorker = initChatWorker();
        console.log("Chat worker started");
        pushWorker = initPushWorker();
        console.log("Push worker started");
        emailWorker = initEmailWorker();
        console.log("Email worker started");
        phoneWorker = initPhoneWorker();
        console.log("Phone worker started");
        outboxWorker = initOutboxWorker();
        console.log("Outbox worker started")
        dailyLeadershipWorker = initDailyLeadershipWorker();
        console.log("Daily leadership worker started")
        resetMonthlyLeadershipBoardWorker = initResetMonthlyLeadershipBoardWorker();
        console.log("Reset monthly leadership board worker started")
        expireAcceptedQuotesWorker = initExpireAcceptedQuotesWorker();
        console.log("Expire accepted quotes worker started")
        setupGracefulShutdown();

        setInterval(() => {
            if (!isShuttingDown) {
                console.log("Worker running...");
            }
        }, 30000);

    } catch (error) {
        console.error("Worker startup failed:", error);
        process.exit(1);
    }
}

function setupGracefulShutdown() {
    const shutdown = async (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`\nReceived ${signal}, starting graceful shutdown...`);

        try {
            await Promise.race([
                chatWorker.close(),
                pushWorker.close(),
                emailWorker.close(),
                phoneWorker.close(),
                outboxWorker.close(),
                dailyLeadershipWorker.close(),
                resetMonthlyLeadershipBoardWorker.close(),
                expireAcceptedQuotesWorker.close(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Worker close timeout')), 5000)
                )
            ]);
            
            console.log("Worker disconnected");
            
            if (AppDataSource.isInitialized) {
                await AppDataSource.destroy();
                console.log("Database connection closed");
            }

            console.log("Shutdown complete");
            process.exit(0);

        } catch (err) {
            console.error("Shutdown error:", err);
            process.exit(1);
        }
    };

    process.on('SIGTERM', shutdown); 
    process.on('SIGINT', shutdown);  
    process.on('SIGHUP', shutdown);  
}

startWorker();
