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
import { OrderItemMeasurementByVendor } from '../entities/OrderItemMeasurementByVendor.mjs';
import { ChatRoom } from '../entities/ChatRoom.mjs';
import { ChatMessage } from '../entities/ChatMessage.mjs';
import { VendorAudit } from '../entities/VendorAudit.mjs';
import { VendorImages } from '../entities/VendorImages.mjs';
import { OrderQuotes } from '../entities/orderQuote.mjs';

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
    entities: [User, Vendors, OtpPhone, OtpEmail, Customers, Orders, OrderItems, OrderVendors, OrderItemMeasurementByVendor, ChatRoom, ChatMessage, VendorAudit, VendorImages, OrderQuotes],

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
