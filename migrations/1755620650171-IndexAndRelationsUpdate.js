/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class IndexAndRelationsUpdate1755620650171 {
    name = 'IndexAndRelationsUpdate1755620650171'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_ORDERS_CUSTOMER_ID" ON "orders" ("customerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ORDERS_SELECTED_VENDOR_ID" ON "orders" ("selectedVendorId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ORDERS_FINAL_QUOTE_ID" ON "orders" ("finalQuoteId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ORDERS_STATUS" ON "orders" ("orderStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_ORDERS_ORDER_STATUS_TIMESTAMP" ON "orders" ("orderStatusTimestamp") `);
        // await queryRunner.query(`CREATE INDEX "IDX_ORDERS_CUSTOMER_ID" ON "orders" ("customerId") `);
        // await queryRunner.query(`CREATE INDEX "IDX_ORDERS_SELECTED_VENDOR_ID" ON "orders" ("selectedVendorId") `);
        // await queryRunner.query(`CREATE INDEX "IDX_ORDERS_FINAL_QUOTE_ID" ON "orders" ("finalQuoteId") `);
        // await queryRunner.query(`CREATE INDEX "IDX_ORDERS_STATUS" ON "orders" ("orderStatus") `);
        // await queryRunner.query(`CREATE INDEX "IDX_ORDERS_ORDER_STATUS_TIMESTAMP" ON "orders" ("orderStatusTimestamp") `);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_fd9992aa21c54c62bc59a844e3c" FOREIGN KEY ("finalQuoteId") REFERENCES "order_quotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_06a051324c76276ca2a9d1feb08" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_06a051324c76276ca2a9d1feb08"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_fd9992aa21c54c62bc59a844e3c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_ORDER_STATUS_TIMESTAMP"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_STATUS"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_FINAL_QUOTE_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_SELECTED_VENDOR_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_CUSTOMER_ID"`);
        // await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_ORDER_STATUS_TIMESTAMP"`);
        // await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_STATUS"`);
        // await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_FINAL_QUOTE_ID"`);
        // await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_SELECTED_VENDOR_ID"`);
        // await queryRunner.query(`DROP INDEX "public"."IDX_ORDERS_CUSTOMER_ID"`);
    }
}
