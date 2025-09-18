export const MESSAGE = {
  SUCCESS: "Success",
  ERROR: "Error",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  BAD_REQUEST: "Bad Request",
  CONFLICT: "Conflict",
  UNPROCESSABLE_ENTITY: "Unprocessable Entity",
};

export const ROLE = {
  CUSTOMER: "customer",
  VENDOR: "vendor",
  ADMIN: "admin",
  SYSTEM: "system"
};

export const ORDER_VENDOR_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  FROZEN: "FROZEN",
  FINALIZED: "FINALIZED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED"
};

export const ORDER_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",

  WORK_STARTED: "WORK_STARTED",

  ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED: "ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED",
  ITEM_PICKED_UP_FROM_CUSTOMER: "ITEM_PICKED_UP_FROM_CUSTOMER",
  ITEM_DELIVERED_TO_VENDOR: "ITEM_DELIVERED_TO_VENDOR",
  ITEM_RECEIVED: "ITEM_RECEIVED",
  ITEM_READY_FOR_PICKUP: "ITEM_READY_FOR_PICKUP",
  ITEM_PICKED_UP_FROM_VENDOR: "ITEM_PICKED_UP_FROM_VENDOR",
  ITEM_DELIVERED_TO_CUSTOMER: "ITEM_DELIVERED_TO_CUSTOMER",

  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",

  REFUNDED: "REFUNDED",
};

export const VENDOR_STATUS = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED"
}

export const OWNERSHIP_TYPE = {
  SINGLE: "single",
  PARTNERSHIP: "partnership",
  PRIVATE_LIMITED: "private limited",
  LIMITED_LIABILITY_PARTNERSHIP: "limited liability partnership",
}

export const SERVICE_TYPE = {
  TAILORS: "tailors",
  LAUNDRY: "laundry",
  OTHER: "other"
}

export const SHOP_TYPE = {
  IN_HOME: "in-home",
  OUTLET: "outlet"
}

export const MISC = {
  PAYMENT_GATEWAY: "PAYMENT_GATEWAY",
  LOGISTICS: "LOGISTICS"
}

export const PAYMENT_STATUS = {
  CAPTURED: "captured",
  FAILED: "failed"
}

export const PAYMENT_ATTEMPT = {
  PENDING: "PENDING",
  PAID: "PAID",
  EXPIRED: "EXPIRED"
}