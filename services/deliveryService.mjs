import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { Orders } from "../entities/Orders.mjs";

export const sendDeliveryRequest = async (payload) => {
    throw new Error("Not implemented");
    // console.log(payload)
}

export const handleDeliveryWebhook = async (req, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
        await queryRunner.startTransaction();

        const { deliveryTrackingId, status } = req.body;

        if (!deliveryTrackingId || !status) throw sendError("Delivery tracking ID and status are required");

        const deliveryTracking = await queryRunner.manager.findOne(DeliveryTracking, { where: { id: deliveryTrackingId } });
        if (!deliveryTracking) throw sendError("Delivery tracking not found");

        deliveryTracking.status = status;   
        deliveryTracking.statusUpdatedAt = new Date();

        await queryRunner.manager.save(DeliveryTracking, deliveryTracking);

        /**
         * 
         * ADD IDEMPOTENCY CHECK
         * 
         */
        const order = await queryRunner.manager.findOne(Orders, { where: { id: deliveryTracking.orderId } });
        if (!order) throw sendError("Order not found");

        switch(deliveryTracking.deliveryType) {
            case "TO_VENDOR":
                if (status === "OUT_FOR_PICKUP") {
                    order.orderStatus = "OUT_FOR_PICKUP";
                    order.orderStatusTimestamp.outForPickupFromCustomerAt = new Date().toString();
                } else if (status === "PICKUP_COMPLETED") {
                    order.orderStatusTimestamp.itemPickedFromCustomerAt = new Date().toString();
                } else if (status === "DELIVERED") {
                    order.orderStatusTimestamp.itemDeliveredToVendorAt = new Date().toString();
                } 
                break;
            
            case "TO_CUSTOMER":
                if (status === "OUT_FOR_PICKUP") {
                    order.orderStatusTimestamp.outForPickupFromVendorAt = new Date().toString();
                } else if (status === "PICKUP_COMPLETED") {
                    order.orderStatusTimestamp.itemPickedFromVendorAt = new Date().toString();
                } else if (status === "DELIVERED") {
                    order.orderStatusTimestamp.itemDeliveredToCustomerAt = new Date().toString();
                }
                break;

            default:
                throw sendError("Invalid delivery type");
        }

        await queryRunner.manager.save(Orders, order);

        await queryRunner.commitTransaction();
        
        return res.status(200).json({
            message: "Delivery tracking updated successfully",
        })
    } catch (error) {
        logger.error("Delivery webhook failed:", {
            error: error.message,
            body: req.body,
            stack: error.stack
        });

        if(queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
throw error;
        return {
            success: false,
            message: error.message || "Failed to process delivery update",
            error: process.env.NODE_ENV === "development" ? error.stack : undefined
        };
    } finally {
        await queryRunner.release();
    }
}