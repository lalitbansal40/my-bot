import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { WsConnection } from "../models/wsConnection.model";
import { pushToAccountLocal } from "./localWsStore";

export const pushToAccount = async (accountId: string, data: any) => {
  try {
    // Local dev: use in-memory WebSocket store
    if (!process.env.LAMBDA_TASK_ROOT) {
      console.log(`[WS] pushToAccount LOCAL — accountId: ${accountId}, type: ${data.type}`);
      pushToAccountLocal(accountId, data);
      return;
    }

    // Lambda/production: use API Gateway Management API
    const connections = await WsConnection.find({ accountId }).lean();
    if (!connections.length) return;

    const payload = Buffer.from(JSON.stringify(data));

    await Promise.allSettled(
      connections.map(async (conn) => {
        const client = new ApiGatewayManagementApiClient({
          endpoint: conn.callbackUrl,
          region: "ap-south-1",
        });

        try {
          await client.send(
            new PostToConnectionCommand({
              ConnectionId: conn.connectionId,
              Data: payload,
            })
          );
        } catch (err: any) {
          // 410 = connection is gone, clean it up
          if (err.$metadata?.httpStatusCode === 410) {
            await WsConnection.deleteOne({ connectionId: conn.connectionId });
          }
        }
      })
    );
  } catch (_) {
    // WebSocket push is best-effort, never block main flow
  }
};
