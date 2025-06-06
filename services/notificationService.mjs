import { logger } from "../utils/logger-utils.mjs";

export const sendEmail = async (email, name, template_id, variables) => {
    try {
    const url = new URL(
        'https://control.msg91.com/api/v5/email/send'
    );

    let headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "authkey": process.env.MSG91_AUTH_KEY
    };

    let body = {
    "recipients": [
        {
        "to": [
            {
            "email": email,
            "name": name
            }
        ],
        "variables": variables
        }
    ],
    "from": {
        "email": "no-reply@nexs.co.in"
    },
    "domain": "nexs.co.in",
    "template_id": template_id
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    const json = await response.json();
    if (json.status === "success") {
      return json;
    }
    logger.error(json)
    return {
        success: false,
        message: "Failed to send email"
    }
    } catch (error) {
        logger.error(error);
        // throw error;
    }
}