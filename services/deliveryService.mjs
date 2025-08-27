import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { Orders } from "../entities/Orders.mjs";
import { createTimelineEntry } from "../services/orderService.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { VendorStats } from "../entities/VendorStats.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { Payouts } from "../entities/Payouts.mjs";

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

        const deliveryTracking = await queryRunner.manager.findOne(DeliveryTracking, { 
            where: { id: deliveryTrackingId },
            select: {
                id: true,
                orderId: true,
                deliveryType: true,
                status: true,
                statusUpdateTimeStamp: true,
            }
        });
        if (!deliveryTracking) throw sendError("Delivery tracking not found");

        /**
         * 
         * ADD IDEMPOTENCY CHECK
         * 
         */
        const order = await queryRunner.manager.findOne(Orders, { 
            where: { id: deliveryTracking.orderId },
            select: {
                id: true,
                selectedVendorId: true,
                finalQuoteId: true,
                orderStatus: true,
                orderStatusTimestamp: true,
            }
        });
        if (!order) throw sendError("Order not found");

        switch(deliveryTracking.deliveryType) {
            case "TO_VENDOR":
                if (status === "PICKUP_ASSIGNED") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_assigned_at ) {
                        throw sendError("Duplicate event: Pickup already assigned", 400);
                    }
                    deliveryTracking.status = "PICKUP_ASSIGNED";
                    deliveryTracking.statusUpdateTimeStamp.pickup_assigned_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                } else if (status === "PICKUP_IN_TRANSIT") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_in_transit_at ) {
                        throw sendError("Duplicate event: Pickup already in transit", 400);
                    }
                    deliveryTracking.status = "PICKUP_IN_TRANSIT";
                    deliveryTracking.statusUpdateTimeStamp.pickup_in_transit_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);
                    
                } else if (status === "PICKUP_COMPLETE") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_completed_at ) {
                        throw sendError("Duplicate event: Pickup already completed", 400);
                    }
                    deliveryTracking.status = "PICKUP_COMPLETE";
                    deliveryTracking.statusUpdateTimeStamp.pickup_completed_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                    await createTimelineEntry(
                        queryRunner,
                        order.id,
                        "ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED",
                        "ITEM_PICKED_UP_FROM_CUSTOMER",
                        "LOGISTICS",
                        "SYSTEM",
                        "Item picked up from customer"
                    )

                } else if (status === "DELIVERY_IN_TRANSIT") {
                    if ( deliveryTracking.statusUpdateTimeStamp.delivery_in_transit_at ) {
                        throw sendError("Duplicate event: Delivery already in transit", 400);
                    }
                    deliveryTracking.status = "DELIVERY_IN_TRANSIT";
                    deliveryTracking.statusUpdateTimeStamp.delivery_in_transit_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                } else if (status === "DELIVERY_COMPLETE") {
                    if ( deliveryTracking.statusUpdateTimeStamp.delivery_completed_at ) {
                        throw sendError("Duplicate event: Delivery already completed", 400);
                    }
                    deliveryTracking.status = "DELIVERY_COMPLETE";
                    deliveryTracking.statusUpdateTimeStamp.delivery_completed_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                    await createTimelineEntry(
                        queryRunner,
                        order.id,
                        "ITEM_PICKED_UP_FROM_CUSTOMER",
                        "ITEM_DELIVERED_TO_VENDOR",
                        "LOGISTICS",
                        "SYSTEM",
                        "Item delivered to vendor"
                    )

                } else {
                    throw sendError("Invalid status: " + status, 400);
                }

                break;
            
            case "TO_CUSTOMER":
                /**
                 * 
                 * After receiving the item_delivered_to_customer, Make the Order COMPLETED
                 * 
                 */
                if (status === "PICKUP_ASSIGNED") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_assigned_at ) {
                        throw sendError("Duplicate event: Pickup already assigned", 400);
                    }
                    deliveryTracking.status = "PICKUP_ASSIGNED";
                    deliveryTracking.statusUpdateTimeStamp.pickup_assigned_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                } else if (status === "PICKUP_IN_TRANSIT") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_in_transit_at ) {
                        throw sendError("Duplicate event: Pickup already in transit", 400);
                    }
                    deliveryTracking.status = "PICKUP_IN_TRANSIT";
                    deliveryTracking.statusUpdateTimeStamp.pickup_in_transit_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                } else if (status === "PICKUP_COMPLETE") {
                    if ( deliveryTracking.statusUpdateTimeStamp.pickup_completed_at ) {
                        throw sendError("Duplicate event: Pickup already completed", 400);
                    }
                    deliveryTracking.status = "PICKUP_COMPLETE";
                    deliveryTracking.statusUpdateTimeStamp.pickup_completed_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                    await createTimelineEntry(
                        queryRunner,
                        order.id,
                        "ITEM_READY_FOR_PICKUP",
                        "ITEM_PICKED_UP_FROM_VENDOR",
                        "LOGISTICS",
                        "SYSTEM",
                        "Item picked up from vendor"
                    )

                } else if (status === "DELIVERY_IN_TRANSIT") {
                    if ( deliveryTracking.statusUpdateTimeStamp.delivery_in_transit_at ) {
                        throw sendError("Duplicate event: Delivery already in transit", 400);
                    }
                    deliveryTracking.status = "DELIVERY_IN_TRANSIT";
                    deliveryTracking.statusUpdateTimeStamp.delivery_in_transit_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                } else if (status === "DELIVERY_COMPLETE") {
                    if ( deliveryTracking.statusUpdateTimeStamp.delivery_completed_at ) {
                        throw sendError("Duplicate event: Delivery already completed", 400);
                    }
                    deliveryTracking.status = "DELIVERY_COMPLETE";
                    deliveryTracking.statusUpdateTimeStamp.delivery_completed_at = new Date().toString();
                    await queryRunner.manager.update(DeliveryTracking, { id: deliveryTrackingId }, deliveryTracking);

                    await createTimelineEntry(
                        queryRunner,
                        order.id,
                        "ITEM_PICKED_UP_FROM_VENDOR",
                        "ITEM_DELIVERED_TO_CUSTOMER",
                        "LOGISTICS",
                        "SYSTEM",
                        "Item delivered to customer"
                    )

                    order.orderStatus = "COMPLETED";
                    order.orderStatusTimestamp.completedAt = new Date().toString();
                    await queryRunner.manager.update(Orders, { id: order.id }, order);

                    /**
                     * 
                     * MAKE THE ORDER VENDOR STATUS AS COMPLETED
                     * 
                     */
                    const orderVendor = await queryRunner.manager.findOne(OrderVendors, {
                        where: { orderId: order.id, vendorId: order.selectedVendorId },
                        select: { id: true, status: true }
                    });
                    if(!orderVendor) throw sendError("Order vendor not found", 404);
                    orderVendor.status = "COMPLETED";
                    await queryRunner.manager.update(OrderVendors, { id: orderVendor.id }, orderVendor);

                    /**
                     * 
                     *  INCREMENT THE VENDOR COMPLETED ORDERS BY 1
                     * 
                     * 
                     */

                    const orderQuote = await queryRunner.manager.findOne(OrderQuotes, { where: { id: order.finalQuoteId }, select: { vendorPayoutAfterCommission: true } });
                    if(!orderQuote) throw sendError("Order quote not found", 404);

                    await queryRunner.manager.update(VendorStats, { vendorId: order.selectedVendorId }, { 
                        totalCompletedOrders: () => "totalCompletedOrders + 1", totalInProgressOrders: () => "totalInProgressOrders - 1", totalEarnings: () => `totalEarnings + ${orderQuote.vendorPayoutAfterCommission}`
                    });

                    /**
                     * 
                     * INITATE PUSH NOTIFICATION TO CUSTOMER FOR RATING & also to vendor for feedback
                     * 
                     */

                    const vendor = await queryRunner.manager.findOne(Vendors, { where: { id: order.selectedVendorId }, select: { razorpay_fund_account_id: true } });
                    if(!vendor) throw sendError("Vendor not found", 404);

                    const payout = queryRunner.manager.create(Payouts, {
                        orderId: order.id,
                        vendorId: order.selectedVendorId,
                        razorpay_fund_account_id: vendor.razorpay_fund_account_id,
                        expected_amount: orderQuote.vendorPayoutAfterCommission,
                        status: "action_required",
                        payout_status_history: {
                            "action_required_at": new Date().toString(),
                            "payout_initiated_by_admin_at": null,
                            "queued_at": null,
                            "processing_at": null,
                            "processed_at": null,
                            "failed_at": null,
                            "reversed_at": null,
                            "cancelled_at": null
                        }
                    });
                    const payout_created = await queryRunner.manager.save(Payouts, payout);
                    if(!payout_created) throw sendError("Failed to create payout", 500);


                }
                break;

            default:
                throw sendError("Invalid delivery type");
        }

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