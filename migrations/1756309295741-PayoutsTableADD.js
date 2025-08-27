/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class PayoutsTableADD1756309295741 {
    name = 'PayoutsTableADD1756309295741'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "vendorId" uuid NOT NULL, "razorpay_fund_account_id" character varying NOT NULL, "expected_amount" numeric(10,2) NOT NULL, "actual_paid_amount" numeric(10,2), "status" character varying NOT NULL, "payout_id" character varying, "utr" character varying, "payout_created_at" TIMESTAMP, "payout_status_history" jsonb, "retry_count" integer NOT NULL DEFAULT '0', "retry_at" TIMESTAMP, "failure_reason" character varying, "retry_details" jsonb, CONSTRAINT "UQ_9725cd634bfc4096ff177a66448" UNIQUE ("payout_id"), CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_PAYOUTS_RAZORPAY_FUND_ACCOUNT_ID" ON "payouts" ("razorpay_fund_account_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_PAYOUTS_STATUS" ON "payouts" ("status") `);
        await queryRunner.query(`ALTER TABLE "payouts" ADD CONSTRAINT "FK_ce0217135b3a7692bb38b75cb7a" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payouts" ADD CONSTRAINT "FK_2c7a8f7dc54ed45db900cc28757" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" DROP CONSTRAINT "FK_2c7a8f7dc54ed45db900cc28757"`);
        await queryRunner.query(`ALTER TABLE "payouts" DROP CONSTRAINT "FK_ce0217135b3a7692bb38b75cb7a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_PAYOUTS_STATUS"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_PAYOUTS_RAZORPAY_FUND_ACCOUNT_ID"`);
        await queryRunner.query(`DROP TABLE "payouts"`);
    }
}
