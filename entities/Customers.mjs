import { EntitySchema } from "typeorm";

export const Customers = new EntitySchema({
    name: "Customers",
    tableName: "customers",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        userId: {
            type: "uuid",
            unique: true
        },
        profilePicture: {
            type: "varchar",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
        }
    },
    relations: {
        user: {
            type: "one-to-one",
            target: "User",
            joinColumn: {
                name: "userId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});

export default Customers;    
