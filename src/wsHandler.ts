import { connectMongo } from "./database/mongodb";
import { WsConnection } from "./models/wsConnection.model";

let isDbConnected = false;

const ensureDb = async () => {
  if (!isDbConnected) {
    await connectMongo();
    isDbConnected = true;
  }
};

export const handler = async (event: any) => {
  try {
    await ensureDb();

    const routeKey: string = event.requestContext.routeKey;
    const connectionId: string = event.requestContext.connectionId;

    if (routeKey === "$connect") {
      const accountId = event.queryStringParameters?.accountId;
      if (!accountId) {
        return { statusCode: 400, body: "accountId required" };
      }

      // serverless-offline uses http://localhost:3001, AWS uses https://domain
      const isOffline = process.env.IS_OFFLINE === "true";
      const callbackUrl = isOffline
        ? `http://localhost:${process.env.OFFLINE_WS_PORT || 3001}`
        : `https://${event.requestContext.domainName}`;

      await WsConnection.create({ connectionId, accountId, callbackUrl });

      return { statusCode: 200, body: "Connected" };
    }

    if (routeKey === "$disconnect") {
      await WsConnection.deleteOne({ connectionId });
      return { statusCode: 200, body: "Disconnected" };
    }

    // $default — ping/pong keepalive
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("wsHandler error:", err);
    return { statusCode: 500, body: "Internal error" };
  }
};
