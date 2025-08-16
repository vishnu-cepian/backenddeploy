/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AddIndexInChatMessage1755359233831 {
    name = 'AddIndexInChatMessage1755359233831'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_CHAT_MESSAGE_ROOM_ID_CREATED_AT" ON "chat_messages" ("chatRoomId", "createdAt") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_CHAT_MESSAGE_ROOM_ID_CREATED_AT"`);
    }
}
