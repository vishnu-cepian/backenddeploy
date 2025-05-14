import { MESSAGE } from "../types/enums/index.mjs";

export const formatResponse = (message, status, data) => {
  if (data) {
    return { message, status, data };
  }
  return { message, status };
};

export const formatError = (message, variable) => {
  return `Message : ${message},\nVar : ${variable}`;
};

export const sendError = (
  message = MESSAGE.INTERNAL_SERVER_ERROR,
  statusCode = 500,
  data = {}
) => {
  if (typeof message !== "string") {
    throw new Error("Invalid message type: expected a string.");
  }

  if (typeof statusCode !== "number" || statusCode < 400 || statusCode > 599) {
    throw new Error(
      "Invalid statusCode: expected a number between 400 and 599."
    );
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid data type: expected an object.");
  }

  return {
    message,
    status: false,
    statusCode,
    ...(Object.keys(data).length && { data }),
  };
};
