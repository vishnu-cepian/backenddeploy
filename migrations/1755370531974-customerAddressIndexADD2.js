/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class CustomerAddressIndexADD21755370531974 {
    name = 'CustomerAddressIndexADD21755370531974'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."customer_address_is_deleted_idx"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`CREATE INDEX "customer_address_is_deleted_idx" ON "customerAddresses" ("isDeleted") `);
    }
}
