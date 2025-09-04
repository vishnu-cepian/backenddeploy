/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class NotificationTableAdded1756996870387 {
    name = 'NotificationTableAdded1756996870387'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "notification_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying NOT NULL, "body" character varying NOT NULL, "isRead" boolean NOT NULL DEFAULT false, "timeStamp" TIMESTAMP NOT NULL, CONSTRAINT "PK_901f37d36fcc63dffdc1281d6bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_NOTIFICATION_HISTORY_USER_ID" ON "notification_history" ("userId") `);
        await queryRunner.query(`ALTER TABLE "notification_history" ADD CONSTRAINT "FK_0f4aa9bb533acbeda49fb4f7cd0" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "notification_history" DROP CONSTRAINT "FK_0f4aa9bb533acbeda49fb4f7cd0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_NOTIFICATION_HISTORY_USER_ID"`);
        await queryRunner.query(`DROP TABLE "notification_history"`);
    }
}
