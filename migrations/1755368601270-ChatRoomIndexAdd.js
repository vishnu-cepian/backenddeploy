/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class ChatRoomIndexAdd1755368601270 {
    name = 'ChatRoomIndexAdd1755368601270'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "lastMessageAt"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "lastMessage"`);
        await queryRunner.query(`CREATE INDEX "IDX_CHAT_ROOM_CUSTOMER_ID" ON "chat_rooms" ("customerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_CHAT_ROOM_VENDOR_ID" ON "chat_rooms" ("vendorId") `);
        await queryRunner.query(`CREATE INDEX "IDX_CHAT_ROOM_UPDATED_AT" ON "chat_rooms" ("updatedAt") `);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "IDX_CHAT_ROOM_CUSTOMER_ID_VENDOR_ID" UNIQUE ("customerId", "vendorId")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "IDX_CHAT_ROOM_CUSTOMER_ID_VENDOR_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CHAT_ROOM_UPDATED_AT"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CHAT_ROOM_VENDOR_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CHAT_ROOM_CUSTOMER_ID"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "lastMessage" text`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "lastMessageAt" TIMESTAMP`);
    }
}
