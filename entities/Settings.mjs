import { EntitySchema } from "typeorm";

export const Settings = new EntitySchema({
    name: "Settings",
    tableName: "settings",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        key: {
            type: "varchar",
            nullable: false
        },
        value: {
            type: "varchar",
            nullable: true
        },
        type: {
            type: "varchar",
            nullable: false
        },
        updatedBy: {
            type: "uuid",
            nullable: true
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
        }
    }
});

export default Settings;    
