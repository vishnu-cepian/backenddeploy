/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class VendorIndexAndLocationIDX1755623662859 {
    name = 'VendorIndexAndLocationIDX1755623662859'

    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."vendor_current_month_rating_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_current_month_bayesian_score_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_current_month_review_count_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_location_gix"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "location" geography(Point,4326)`);
        await queryRunner.query(`CREATE INDEX "vendor_location_gix" ON "vendors" USING GiST ("location") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "vendor_user_id_idx" ON "vendors" ("userId") `);
        await queryRunner.query(`CREATE INDEX "vendor_search_score_idx" ON "vendors" ("serviceType", "status", "currentMonthBayesianScore") `);
        // await queryRunner.query(`CREATE INDEX "vendor_location_gix" ON "vendors" USING GiST ("location") `);
        // await queryRunner.query(`CREATE UNIQUE INDEX "vendor_user_id_idx" ON "vendors" ("userId") `);
        // await queryRunner.query(`CREATE INDEX "vendor_search_score_idx" ON "vendors" ("serviceType", "status", "currentMonthBayesianScore") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."vendor_search_score_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_user_id_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_location_gix"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_search_score_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_user_id_idx"`);
        // await queryRunner.query(`DROP INDEX "public"."vendor_location_gix"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "location" geometry(POINT,4326)`);
        await queryRunner.query(`CREATE INDEX "vendor_location_gix" ON "vendors" USING GiST ("location") `);
        await queryRunner.query(`CREATE INDEX "vendor_current_month_review_count_idx" ON "vendors" ("currentMonthReviewCount") `);
        await queryRunner.query(`CREATE INDEX "vendor_current_month_bayesian_score_idx" ON "vendors" ("currentMonthBayesianScore") `);
        await queryRunner.query(`CREATE INDEX "vendor_current_month_rating_idx" ON "vendors" ("currentMonthRating") `);
    }
}
