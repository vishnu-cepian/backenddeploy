/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AdminLoginHistoryTableADD1756128154275 {
    name = 'AdminLoginHistoryTableADD1756128154275'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "adminLoginHistory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "adminUserId" uuid NOT NULL, "adminEmail" character varying NOT NULL, "ipAddress" character varying NOT NULL, "loginTime" TIMESTAMP NOT NULL, "logoutTime" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c38b75065bce31cad2206585b6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" ADD CONSTRAINT "FK_0b7e917625ba651328168b9a9be" FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "adminLoginHistory" DROP CONSTRAINT "FK_0b7e917625ba651328168b9a9be"`);
        await queryRunner.query(`DROP TABLE "adminLoginHistory"`);
    }
}
