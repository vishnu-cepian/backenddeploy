/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AdminLoginHistoryColumnAlter1756128524564 {
    name = 'AdminLoginHistoryColumnAlter1756128524564'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" ALTER COLUMN "logoutTime" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" ALTER COLUMN "logoutTime" DROP DEFAULT`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" ALTER COLUMN "logoutTime" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" ALTER COLUMN "logoutTime" SET NOT NULL`);
    }
}
