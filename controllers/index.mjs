import { logger } from "../utils/logger-utils.mjs";
import { formatResponse } from "../utils/core-utils.mjs";

export const indexController = (req, res) => {
  res.json(formatResponse("no route found", false, {}));
};


export const controllerWrapper = (controller, options = {}) => {
  return async (req, res, next) => {
    const { logRequest = false, logResponse = false } = options; // Destructure options with default values

    try {
      if (logRequest) {
        logger.debug(`Incoming Request: ${req.method} ${req.originalUrl}`, {
          body: req.body,
          params: req.params,
          query: req.query,
        });
      }

      await controller(req, res, next); // Make sure to pass next

      if (logResponse) {
        logger.debug(`Response: ${res.statusCode} ${res.statusMessage}`);
      }
    } catch (error) {
      logger.error(`Error: ${error.message}`, { stack: error.stack });
      next(error); // Pass any errors to the error-handling middleware
    }
  };
};