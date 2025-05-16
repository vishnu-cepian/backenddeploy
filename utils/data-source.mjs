import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../entities/User.mjs';
import { Vendor } from '../entities/Vendor.mjs';
import { OtpPhone } from '../entities/OtpPhone.mjs';
import { OtpEmail } from '../entities/OtpEmail.mjs';
import 'dotenv/config'

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL + "?sslmode=require",
    // host: process.env.DB_HOST,
    // port: process.env.DB_PORT,
    // username: process.env.DB_USERNAME,
    // password: process.env.DB_PASSWORD,
    // database: process.env.DB_DATABASE,
    schema: "public",
    synchronize: true,
    entities: [User, Vendor, OtpPhone, OtpEmail],

//     ssl: true,
//     extra: {
//     ssl: {
//       rejectUnauthorized: false // For self-signed certificates
//     }
//   }

//   FOR DIFFERENT ENVIRONMENTS
// ssl: process.env.NODE_ENV === 'production' ? {
//   rejectUnauthorized: true,
//   ca: fs.readFileSync('/path/to/ca-certificate.crt').toString()
// } : false
});
