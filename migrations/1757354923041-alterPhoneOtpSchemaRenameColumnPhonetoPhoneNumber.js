/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AlterPhoneOtpSchemaRenameColumnPhonetoPhoneNumber1757354923041 {
    name = 'AlterPhoneOtpSchemaRenameColumnPhonetoPhoneNumber1757354923041'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_OTP_PHONE_PHONE"`);
        await queryRunner.query(`ALTER TABLE "otp_phone" RENAME COLUMN "phone" TO "phoneNumber"`);
        await queryRunner.query(`ALTER TABLE "otp_phone" RENAME CONSTRAINT "UQ_a318c47d810fe1b1192c395bce7" TO "UQ_b7a9f66582a424eada532f93b2c"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_OTP_PHONE_PHONE_NUMBER" ON "otp_phone" ("phoneNumber") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_OTP_PHONE_PHONE_NUMBER"`);
        await queryRunner.query(`ALTER TABLE "otp_phone" RENAME CONSTRAINT "UQ_b7a9f66582a424eada532f93b2c" TO "UQ_a318c47d810fe1b1192c395bce7"`);
        await queryRunner.query(`ALTER TABLE "otp_phone" RENAME COLUMN "phoneNumber" TO "phone"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_OTP_PHONE_PHONE" ON "otp_phone" ("phone") `);
    }
}
