import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as vendorService from "../services/vendorService.mjs";
import {UAParser} from "ua-parser-js";

export const checkProfile = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.checkProfile(data);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const completeProfile = async (req, res, next) => {
  try {
    const parser = new UAParser();
    parser.setUA(req.headers['user-agent']);
    const dI = parser.getResult();
    const deviceInfo = {
      ip : req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress,
      device: dI.device.type,
      browser: dI.browser.name,
      version: dI.browser.version,
      platform: dI.os.name,
    }

    const data = {
      userId: req.user.id,
      ...req.body,
    };
    const response = await vendorService.completeProfile(data, deviceInfo);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getVendorDetails = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };
    const response = await vendorService.getVendorDetails(data);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const saveVendorAvatarUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      ...req.body,
    };

    const response = await vendorService.saveVendorAvatarUrl(data);
    if (!response) {
      throw new Error(formatError("Avatar creation failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getVendorAvatarUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.getVendorAvatarUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor avatar fetch failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const deleteVendorAvatarUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.deleteVendorAvatarUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor avatar detetion failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const saveShopImageUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      ...req.body
    };

    const response = await vendorService.saveShopImageUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor shop image creation failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getShopImageUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.getShopImageUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor shop image fetch failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const deleteShopImageUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.deleteShopImageUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor shop image deleteion failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const saveWorkImageUrl = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      ...req.body
    };

    const response = await vendorService.saveWorkImageUrl(data);
    if (!response) {
      throw new Error(formatError("Vendor work image creation failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getVendorWorkImages = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.getVendorWorkImages(data);
    if (!response) {
      throw new Error(formatError("Vendor work image fetch failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const deleteVendorWorkImage = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      s3Key: req.params.s3Key,
    };

    const response = await vendorService.deleteVendorWorkImage(data);
    if (!response) {
      throw new Error(formatError("Vendor work image deletion failed", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getVendorOrders = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      page: parseInt(req.params.page),
      limit: parseInt(req.params.limit),
      status: req.query.status,
    }

    const response = await vendorService.getVendorOrders(data);
    if (!response) {
      throw new Error(formatError("Vendor orders not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
}

export const getVendorOrderById = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      orderVendorId: req.params.orderVendorId,
    }

    const response = await vendorService.getVendorOrderById(data);
    if (!response) {
      throw new Error(formatError("Vendor order not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
}

export const getVendorQuote = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      orderVendorId: req.params.orderVendorId,
    }

    const response = await vendorService.getVendorQuote(data);
    if (!response) {
      throw new Error(formatError("Vendor order not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
}

export const getVendorStats = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    }

    const response = await vendorService.getVendorStats(data);
    if (!response) {
      throw new Error(formatError("Vendor stats not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
}

export const addComplaint = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      orderId: req.params.orderId,
      complaint: req.body.complaint,
    }

    const response = await vendorService.addComplaint(data);
    if (!response) {
      throw new Error(formatError("Complaint not added", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
}