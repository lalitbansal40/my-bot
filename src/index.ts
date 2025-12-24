export const handler = async (event: any) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath?.replace(/\/$/, "");

    // ROOT
    if (path === "" || path === "/") {
      return { statusCode: 200, body: "APP RUNNING ✅" };
    }

    // WEBHOOK PLACEHOLDER
    if (path === "/webhook" && method === "GET") {
      return { statusCode: 200, body: "WEBHOOK GET OK" };
    }

    if (path === "/webhook" && method === "POST") {
      return { statusCode: 200, body: "WEBHOOK POST OK" };
    }

    return { statusCode: 404, body: "NOT FOUND" };
  } catch (err) {
    console.error("ROOT ERROR:", err);
    return { statusCode: 500, body: "INTERNAL ERROR" };
  }
};
