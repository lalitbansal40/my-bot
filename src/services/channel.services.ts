import { Channel } from "../models/channel.model";

export const getChannelByPhoneNumberId = async (
  phone_number_id: string
) => {

  return Channel.findOne({
    phone_number_id,
    is_active: true,
  }).lean();
};
