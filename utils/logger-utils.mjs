import winston from "winston";

// Custom formatter to handle Error stack traces
const customFormatter = winston.format((info) => {
  if (info instanceof Error) {
    // Safely handle and format error stack traces
    const data = info.stack
      ? info.stack
          .toString()
          .replace(/Error: /gi, "")
          .replace(/\s+/gi, " ")
          .replace(/\n/gi, "")
      : info.message; // Fallback to message if stack is not available

    info.message = data || info.message;
  }
  return info; // Always return info
});

// Formatter function to combine multiple formats
const formatter = () => {
  return winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    customFormatter(), // Call the custom formatter
    winston.format.simple() // Simple log format
  );
};

// Logger configuration
export const logger = winston.createLogger({
  level: "debug",
  format: formatter(),
  transports: [new winston.transports.Console()],
});

// Adding production-specific logging configuration
if (["production", "staging"].includes(process.env.NODE_ENV || "")) {
  const prodConfig = new winston.transports.Console({
    format: formatter(),
    level: "warn",
  });
  logger.clear();
  logger.add(prodConfig);
}
