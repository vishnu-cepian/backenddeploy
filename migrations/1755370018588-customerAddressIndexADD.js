/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class CustomerAddressIndexADD1755370018588 {
    name = 'CustomerAddressIndexADD1755370018588'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."customer_address_is_default_idx"`);
        await queryRunner.query(`DROP INDEX "public"."customer_address_is_deleted_idx"`);
        await queryRunner.query(`CREATE INDEX "customer_address_customer_default_idx" ON "customerAddresses" ("customerId", "isDefault") `);
        await queryRunner.query(`CREATE INDEX "customer_address_customer_active_idx" ON "customerAddresses" ("customerId", "isDeleted") `);

    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."customer_address_customer_active_idx"`);
        await queryRunner.query(`DROP INDEX "public"."customer_address_customer_default_idx"`);
        await queryRunner.query(`DROP INDEX "public"."customer_address_customer_active_idx"`);
        await queryRunner.query(`DROP INDEX "public"."customer_address_customer_default_idx"`);
        await queryRunner.query(`CREATE INDEX "customer_address_is_deleted_idx" ON "customerAddresses" ("isDeleted") `);
        await queryRunner.query(`CREATE INDEX "customer_address_is_default_idx" ON "customerAddresses" ("isDefault") `);
    }
}
