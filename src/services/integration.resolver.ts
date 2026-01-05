import Integration from "../models/integration.model";

export const getIntegration = async (
  userId: string,
  slug: string
) => {
  const integration = await Integration.findOne({
    user_id: userId,
    slug,
    is_active: true,
  });

  if (!integration) {
    throw new Error(`${slug} integration not configured`);
  }

  return integration.config;
};
