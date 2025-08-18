import { EntitySchema } from "typeorm";

export const LeaderboardHistory = new EntitySchema({
    name: "LeaderboardHistory",
    tableName: "leaderboard_history",
    indices: [
        { name: "IDX_LEADERBOARD_HISTORY_LOOKUP", columns: ["serviceType", "monthYear", "bayesianScore"] }
    ],
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid"
        },
        vendorId: {
            type: "uuid",
            nullable: false
        },
        serviceType: {
            type: "varchar",
            nullable: false
        },
        monthYear: {
            type: "varchar",
            nullable: false
        },
        currentMonthRating: {
            type: "numeric",
            precision: 3,
            scale: 2,
            nullable: false
        },
        currentMonthReviewCount: {
            type: "int",
            nullable: false
        },
        bayesianScore: {
            type: "numeric",
            precision: 3,
            scale: 2,
            nullable: false
        },
        rank: {
            type: "int",
            nullable: false
        },
    },
    relations: {
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
})
