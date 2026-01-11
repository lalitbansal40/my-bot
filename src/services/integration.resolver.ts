import { Types } from "mongoose";
import Integration from "../models/integration.model";

export const getIntegration = async (
  userId: string,
  slug: string
) => {
  console.log({userId:new Types.ObjectId(userId),slug})
  const integration = await Integration.findOne({
    user_id: new Types.ObjectId(userId),
    slug,
    is_active: true,
  });

  if (!integration) {
    throw new Error(`${slug} integration not configured`);
  }

  return integration.config;
};
