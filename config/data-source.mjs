import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../entities/User.mjs';
import { Vendors } from '../entities/Vendors.mjs';
import { OtpPhone } from '../entities/OtpPhone.mjs';
import { OtpEmail } from '../entities/OtpEmail.mjs';
import { Customers } from '../entities/Customers.mjs';
import { Orders } from '../entities/Orders.mjs';
import { OrderItems } from '../entities/OrderItems.mjs';
import { OrderVendors } from '../entities/OrderVendors.mjs';
import { ChatRoom } from '../entities/ChatRoom.mjs';
import { ChatMessage } from '../entities/ChatMessage.mjs';
import { VendorAudit } from '../entities/VendorAudit.mjs';
import { VendorImages } from '../entities/VendorImages.mjs';
import { OrderQuotes } from '../entities/OrderQuote.mjs';
import { Payments } from '../entities/Payments.mjs';
import { Rating } from '../entities/Rating.mjs';
import { LeaderboardHistory } from '../entities/LeaderboardHistory.mjs';
import { PaymentFailures } from '../entities/PaymentFailures.mjs';  
import { QueueLogs } from '../entities/queueLogs.mjs';
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
    entities: [User, Vendors, OtpPhone, OtpEmail, Customers, Orders, OrderItems, OrderVendors, ChatRoom, ChatMessage, VendorAudit, VendorImages, OrderQuotes, Payments, Rating, LeaderboardHistory, PaymentFailures, QueueLogs],

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


// FOR PRODUCTION

// export const AppDataSource = new DataSource({
//     type: "postgres",
//     host: process.env.DB_HOST, // your RDS endpoint
//     port: 5432,
//     username: process.env.DB_USER, // 'postgres'
//     password: process.env.DB_PASS,
//     database: process.env.DB_NAME, // e.g. 'myapp'
//     synchronize: false, // ✅ false in production
//     logging: true,
//     entities: ["src/entities/*.js"], // adjust path as needed
//     migrations: ["src/migrations/*.js"],
//     ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
//   });