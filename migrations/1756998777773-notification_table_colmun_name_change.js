/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class NotificationTableColmunNameChange1756998777773 {
    name = 'NotificationTableColmunNameChange1756998777773'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "notification_history" RENAME COLUMN "timeStamp" TO "timestamp"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "notification_history" RENAME COLUMN "timestamp" TO "timeStamp"`);
    }
}
