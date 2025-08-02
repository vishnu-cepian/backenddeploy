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
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED: "ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  IN_PROGRESS: "IN_PROGRESS",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED"
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
  PRIVATE_LIMITED: "private limited"
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